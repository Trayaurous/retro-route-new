import webview
import webview.window
import subprocess
import sys
import os
import time
import threading
import socket
from flask import Flask, request, jsonify, render_template_string, send_from_directory
import sqlite3
import json
from datetime import datetime

def add_cors_headers(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    return response

frontend_process = None
flask_thread = None

# 【核心修复1】将 Flask 静态文件夹指向 React 的 dist 构建目录，并将静态资源根目录设为 '/'
frontend_build_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), 'dist'))
app = Flask(__name__, static_folder=frontend_build_dir, static_url_path='/')

@app.after_request
def after_request(response):
    return add_cors_headers(response)

@app.route('/api/tasks', methods=['OPTIONS'])
def handle_options():
    return add_cors_headers(jsonify({'status': 'ok'}))

@app.route('/api/tasks/<task_id>', methods=['OPTIONS'])
def handle_options_id(task_id):
    return add_cors_headers(jsonify({'status': 'ok'}))

DB_PATH = os.path.join(os.path.dirname(__file__), 'retro_route.db')
FRONTEND_PORT = 5173
FLASK_PORT = 5001
FRONTEND_URL = f'http://localhost:{FRONTEND_PORT}'

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS retro_cartridges (
            id TEXT PRIMARY KEY,
            task_name TEXT NOT NULL,
            task_data TEXT NOT NULL,
            created_at TEXT,
            updated_at TEXT
        )
    ''')
    conn.commit()
    conn.close()

@app.route('/api/tasks', methods=['GET'])
def get_tasks():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM retro_cartridges ORDER BY updated_at DESC')
    rows = cursor.fetchall()
    conn.close()

    tasks = []
    for row in rows:
        task = dict(row)
        try:
            task['task_data'] = json.loads(task['task_data']) if task['task_data'] else {}
        except:
            task['task_data'] = {}
        tasks.append(task)

    return jsonify(tasks)

@app.route('/api/tasks', methods=['POST'])
def create_task():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400

    task_id = data.get('id')
    task_name = data.get('name', 'UNTITLED')
    task_data = data.get('task_data', {})

    if not task_id:
        return jsonify({'error': 'Task ID is required'}), 400

    now = datetime.now().isoformat()

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute(
        'INSERT INTO retro_cartridges (id, task_name, task_data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        (task_id, task_name, json.dumps(task_data), now, now)
    )
    conn.commit()
    conn.close()

    return jsonify({'id': task_id, 'message': 'Task created successfully'}), 201

@app.route('/api/tasks/<task_id>', methods=['PUT'])
def update_task(task_id):
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400

    task_name = data.get('name')
    task_data = data.get('task_data', {})

    now = datetime.now().isoformat()

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    if task_name and task_data:
        cursor.execute(
            'UPDATE retro_cartridges SET task_name = ?, task_data = ?, updated_at = ? WHERE id = ?',
            (task_name, json.dumps(task_data), now, task_id)
        )
    elif task_name:
        cursor.execute(
            'UPDATE retro_cartridges SET task_name = ?, updated_at = ? WHERE id = ?',
            (task_name, now, task_id)
        )
    elif task_data:
        cursor.execute(
            'UPDATE retro_cartridges SET task_data = ?, updated_at = ? WHERE id = ?',
            (json.dumps(task_data), now, task_id)
        )

    conn.commit()
    affected = cursor.rowcount

    if affected == 0:
        cursor.execute(
            'INSERT INTO retro_cartridges (id, task_name, task_data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
            (task_id, task_name or 'Untitled', json.dumps(task_data), now, now)
        )
        conn.commit()

    conn.close()

    return jsonify({'id': task_id, 'message': 'Task saved successfully'})

@app.route('/api/tasks/<task_id>', methods=['DELETE'])
def delete_task(task_id):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('DELETE FROM retro_cartridges WHERE id = ?', (task_id,))
    conn.commit()
    affected = cursor.rowcount
    conn.close()

    if affected == 0:
        return jsonify({'error': 'Task not found'}), 404

    return jsonify({'id': task_id, 'message': 'Task deleted successfully'})


@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({'status': 'ok', 'database': os.path.exists(DB_PATH)})

@app.route('/api/ip', methods=['GET'])
def get_ip_addresses():
    ips = []
    try:
        # 获取所有网络接口的IP地址
        hostname = socket.gethostname()
        # 获取主机名对应的IP
        local_ip = socket.gethostbyname(hostname)
        if local_ip and not local_ip.startswith('127.'):
            ips.append(local_ip)
        
        # 尝试获取更多IP地址
        for info in socket.getaddrinfo(hostname, None):
            ip = info[4][0]
            if ':' not in ip and ip not in ips and not ip.startswith('127.'):
                ips.append(ip)
    except:
        pass
    
    # 如果没有获取到，添加localhost
    if not ips:
        ips = ['localhost']
    
    return jsonify({'ips': ips})

@app.route('/console', methods=['GET'])
def serve_console():
    console_path = os.path.join(os.path.dirname(__file__), 'console.html')
    with open(console_path, 'r', encoding='utf-8') as f:
        html_content = f.read()
    return render_template_string(html_content)

# 【核心修复2】替换原有的 /m 路由为 Catch-All，全面接管前端路由与静态资源请求
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_react_app(path):
    # 确保后端的 API 错误不会被错误地返回为 index.html 网页
    if path.startswith('api/'):
        return jsonify({'error': 'API endpoint not found'}), 404

    # 如果请求路径对应的文件存在于 dist 目录（例如 js, css, png），直接返回该文件
    if path != "" and os.path.exists(os.path.join(app.static_folder, path)):
        return send_from_directory(app.static_folder, path)
    # 如果请求的是前端页面路由（如 / 或 /m），一律返回 index.html，让前端接管
    else:
        try:
            return send_from_directory(app.static_folder, 'index.html')
        except FileNotFoundError:
            return "Vite 'dist' folder not found. Please run 'npm run build' first.", 404

def start_frontend():
    global frontend_process
    frontend_dir = os.path.dirname(os.path.abspath(__file__))
    try:
        frontend_process = subprocess.Popen(
            ['npm', 'run', 'dev', '--', '--host'],
            cwd=frontend_dir,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            preexec_fn=os.setsid if sys.platform != 'win32' else None
        )
        time.sleep(5)
        print("Frontend process started!")
    except Exception as e:
        print(f"Failed to start frontend: {e}")
        print("Please make sure npm is installed and run 'npm install' first.")

def start_flask():
    app.run(host='0.0.0.0', port=FLASK_PORT, debug=False, use_reloader=False)

def cleanup():
    global frontend_process
    print("\nShutting down...")
    if frontend_process:
        try:
            if sys.platform == 'win32':
                frontend_process.terminate()
            else:
                os.killpg(os.getpgid(frontend_process.pid), 9)
            frontend_process.wait()
            print("Frontend stopped.")
        except Exception as e:
            print(f"Error stopping frontend: {e}")
    sys.exit(0)

def on_shutdown(*args):
    pass

class Api:
    def open_browser(self):
        import webbrowser
        webbrowser.open(f'http://localhost:{FRONTEND_PORT}')
        return {'status': 'ok'}

def start_all():
    global frontend_process

    print("Starting Flask server on port", FLASK_PORT)
    flask_thread = threading.Thread(target=start_flask, daemon=True)
    flask_thread.start()

    # 等待Flask启动
    time.sleep(2)

    print("Starting frontend...")
    start_frontend()

    print("Starting webview console...")
    api = Api()
    
    # 加载本地控制台界面
    console_path = os.path.join(os.path.dirname(__file__), 'console.html')
    console_url = f'file://{os.path.abspath(console_path)}'
    
    # 使用Flask提供的/console路由
    window = webview.create_window(
        'Retro Route - Server Console',
        f'http://localhost:{FLASK_PORT}/console',
        width=1000,
        height=700,
        resizable=True,
        fullscreen=False,
        js_api=api
    )

    webview.start(debug=False)
    print("Window closed")

if __name__ == '__main__':
    init_db()

    print("=" * 50)
    print("  RETRO ROUTE - Desktop Application")
    print("=" * 50)

    start_all()
    cleanup()
    print("All stopped.")