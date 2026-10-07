"""Export the legacy SQLite database without starting Flask or changing the database."""
import argparse
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--database', type=Path, default=Path('retro_route.db'))
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists():
        parser.error('Output already exists. Choose a different filename.')
    with sqlite3.connect(args.database.resolve().as_uri() + '?mode=ro', uri=True) as connection:
        connection.row_factory = sqlite3.Row
        rows = [dict(row) for row in connection.execute('SELECT * FROM retro_cartridges ORDER BY updated_at DESC')]
    payload = {'format': 'retro-route-legacy', 'version': 1, 'exportedAt': datetime.now(timezone.utc).isoformat(), 'tasks': rows}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open('x', encoding='utf-8') as output:
        json.dump(payload, output, ensure_ascii=False, indent=2)
    print(f'Exported {len(rows)} route(s) to {args.output}. Database unchanged.')


if __name__ == '__main__':
    main()
