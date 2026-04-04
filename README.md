# WBO Enhanced

An enhanced collaborative whiteboard built on top of [WBO (Whitebophir)](https://github.com/lovasoa/whitebophir). Multiple users draw simultaneously on a shared canvas with real-time sync and automatic persistence. WBO Enhanced adds A4 notebook mode, shape recognition, PDF/image export, image embedding, and improved tablet support.

## Features

| Feature                     | Description                                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Infinite boards**         | Classic WBO free-form canvas — draw anywhere, canvas grows as needed                                                      |
| **A4 Notebook mode**        | Paginated A4 books with add/delete pages and a thumbnail sidebar                                                          |
| **Shape auto-detection**    | Freehand strokes snap into clean lines, rectangles, triangles, and circles on pen-up (Xournal++ inertia-tensor algorithm) |
| **PDF / Image export**      | Export a single board or an entire book as PDF, PNG, or SVG                                                               |
| **Image embedding**         | Drag-and-drop raster images onto the canvas — resizable, synced to all clients                                            |
| **Ruled backgrounds**       | Narrow-ruled and wide-ruled line backgrounds alongside dots and grid                                                      |
| **Collapsible palette**     | Color picker collapses to a single swatch; expands on tap                                                                 |
| **Landing page**            | Thumbnail previews of recent boards and books                                                                             |
| **Tablet support**          | Finger pans the canvas, stylus draws; hand tool works on iPad                                                             |
| **Real-time collaboration** | Socket.IO sync — every stroke is broadcast and persisted                                                                  |
| **JWT authentication**      | Optional role-based access (moderator / editor) per board                                                                 |

## Quick Start (Docker)

```bash
git clone https://github.com/BrandonTrigueros/WBO_Enhanced.git
cd WBO_Enhanced
docker compose up -d --build
```

Open **http://localhost:9090** in your browser.

Board data is persisted in `./wbo-boards/`.

## Running Without Docker

```bash
cd whitebophir
npm install --production
PORT=8080 npm start
```

Then visit **http://localhost:8080**.

## Architecture

```
WBO_Enhanced/
├── docker-compose.yaml          # single-service Docker Compose
├── Dockerfile                   # node:18-slim image
└── whitebophir/
    ├── server/                  # Node.js backend
    │   ├── server.js            # HTTP + Socket.IO bootstrap
    │   ├── socket/              # real-time message relay + rate limiting
    │   ├── board/               # board persistence (JSON files)
    │   ├── book/                # book (multi-page) CRUD
    │   ├── http/                # routers, templating, image upload
    │   ├── export/              # SVG, PDF renderers
    │   └── auth/                # JWT verification
    ├── client-data/
    │   ├── js/
    │   │   ├── core/            # board.js, canvasState, drawingEngine,
    │   │   │                    #   socketManager, toolRegistry, uiController
    │   │   ├── shapeRecognizer/ # inertia tensor recognizer (7 modules)
    │   │   ├── lib/             # path-data polyfill, color helpers, etc.
    │   │   ├── book.js          # book page navigation
    │   │   └── pageSidebar.js   # thumbnail sidebar for books
    │   └── tools/               # pencil, hand, eraser, line, rect,
    │                            #   ellipse, text, zoom, image, grid, etc.
    └── tests/
        ├── unit/                # 59 suites, 123 tests
        └── api/                 # HTTP endpoint tests
```

## Configuration

WBO reads configuration from environment variables. Key settings (see [`server/configuration.js`](./server/configuration.js) for the full list):

| Variable             | Default          | Description                              |
| -------------------- | ---------------- | ---------------------------------------- |
| `PORT`               | `8080`           | HTTP listen port                         |
| `HOST`               | `0.0.0.0`        | Bind address                             |
| `WBO_HISTORY_DIR`    | `./server-data/` | Board persistence directory              |
| `WBO_MAX_EMIT_COUNT` | `192`            | Max messages per 4 s (higher = smoother) |
| `AUTH_SECRET_KEY`    | _(none)_         | JWT secret for authenticated boards      |

## Authentication

WBO supports [JWT](https://jwt.io/) tokens passed as a `?token=` query parameter.

Payload example:

```json
{
  "iat": 1516239022,
  "exp": 1516298489,
  "roles": ["moderator:myBoard", "editor:otherBoard"]
}
```

Roles: `moderator` (can clear board), `editor` (can draw — default for all users without JWT). Board-scoped roles use the `role:boardName` syntax.

## Export & Preview

| Endpoint                          | Description                 |
| --------------------------------- | --------------------------- |
| `GET /preview/{boardName}`        | SVG preview of a board      |
| `GET /api/export/pdf/{boardName}` | PDF download                |
| `GET /api/export/png/{boardName}` | PNG download                |
| Book export (UI button)           | Multi-page PDF of all pages |

## Tests

```bash
npm test            # unit + API (123 tests)
npm run test:unit   # unit only
npm run test:api    # API only
```

## Keyboard Shortcuts

| Key           | Tool             |
| ------------- | ---------------- |
| `p`           | Pencil           |
| `h`           | Hand / Selector  |
| `e`           | Eraser           |
| `l`           | Straight line    |
| `r`           | Rectangle        |
| `c`           | Ellipse          |
| `t`           | Text             |
| `z`           | Zoom             |
| `1`–`0`       | Color presets    |
| `Ctrl+Scroll` | Zoom in/out      |
| `Alt+Scroll`  | Change tool size |

## Credits

Based on [WBO (Whitebophir)](https://github.com/lovasoa/whitebophir) by Ophir Lojkine.

Shape recognition algorithm ported from [Xournal++](https://github.com/xournalpp/xournalpp) (GPLv2+).

## License

[AGPL-3.0-or-later](./LICENSE)
