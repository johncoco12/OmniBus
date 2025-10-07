<div align="center">

# OmniBus

Simple web explorer for message brokers. RabbitMQ works today. Azure Service Bus is planned.

<p>
<img alt="Status" src="https://img.shields.io/badge/status-alpha-orange" />
<img alt="License" src="https://img.shields.io/badge/license-NCPFL-important" />
<img alt="Node" src="https://img.shields.io/badge/node-%3E=18-green" />
<img alt="Type" src="https://img.shields.io/badge/model-source--available-lightgrey" />
</p>

</div>

---

## Overview

OmniBus lets you browse queues and messages in the browser with no install other than `npm install`. It aims to stay fast, clear, and minimal.

Current focus: RabbitMQ over Web STOMP.  
Next focus: Azure Service Bus (peek, send, dead-letter, move).  
Stretch: shared abstractions so adding another broker is low friction.

## Goals

- Fast page loads
- Low noise UI
- Safe actions (no surprise destructive clicks)
- Works fully in the browser
- Easy to extend with another provider

## Feature Status

| Feature | RabbitMQ | Azure Service Bus |
|---------|----------|-------------------|
| List queues | ✅ | Planned |
| View messages | ✅ | Planned |
| Peek vs consume | ✅ | Planned |
| Send message | ✅ | Planned |
| Delete message | ✅ | Planned |
| Move / requeue | ✅ | Planned |
| Dead-letter handling | Planned | Planned |
| Saved connections | ✅ | ✅ |
| Dark theme | ✅ | ✅ |

Planned Azure Service Bus (ASB) sequence:
1. Connection + namespace browse
2. Queue/topic listing
3. Peek + deferred + DLQ view
4. Send + schedule
5. Move / dead-letter operations

## Quick Start (RabbitMQ local)

1. Install dependencies:
```bash
npm install
```
2. Start dev server (Expo web):
```bash
npm run web
```
3. Start RabbitMQ (Docker):
```bash
docker-compose up -d
```
4. Open the app in your browser and add a server using the connection string format below.

To stop:
```bash
docker-compose down
```

## RabbitMQ connection string

Format:
```
<ws_stomp_url>;<management_api_url>
```

Example:
```
ws://guest:guest@localhost:15674/ws;http://guest:guest@localhost:15672
```

Browser STOMP traffic goes to the Web STOMP endpoint; management calls (queue metadata) go to the HTTP Management API.

## Docker stack (RabbitMQ)

Ports:
- UI: http://localhost:15672 (guest / guest)
- AMQP: 5672
- Web STOMP: 15674 (path /ws)
- STOMP: 61613

Plugins enabled:
- rabbitmq_management
- rabbitmq_web_stomp
- rabbitmq_stomp

View logs:
```bash
docker-compose logs -f rabbitmq
```

## Scripts

```bash
npm run web           # Start web dev
npm run lint          # (Add ESLint config to enable)
npm run typecheck     # (tsc --noEmit)
```

## Configuration (early stage)

Currently minimal; future Azure Service Bus support will use environment variables.

Planned `.env` (example):
```
OMNIBUS_LOG_LEVEL=info
OMNIBUS_MAX_MESSAGE_BYTES=262144
```

(You will add `dotenv` + loader when config grows.)

## Project structure

```
components/            # Presentation components
sources/services/      # Core service abstractions & implementations
  interfaces/          # Contracts
  implementations/     # Concrete providers (e.g., RabbitMQ)
  container.ts         # tsyringe DI container wiring
  ServiceBusManager.ts # High-level broker orchestration
  ConnectionRepository.ts # Persistence for saved servers
docker-compose.yml     # Local RabbitMQ environment
App.tsx                # App entry
```

## Architecture

- UI Layer: React Native Web components (stateless where possible)
- Service Layer: Broker-agnostic managers exposed through DI
- Transport: STOMP over WebSocket for RabbitMQ (via @stomp/stompjs)
- Persistence: AsyncStorage for saved connections
- Theming: VS Code-inspired dark palette

Dependency Injection (tsyringe) allows plugging additional transports (Azure Service Bus REST / AMQP) without refactoring UI components.

## Design notes

- No direct broker coupling in UI components
- Graceful failure surfaces (timeouts, unreachable host)
- Serializable connection definitions
- Avoid vendor lock inside presentation logic

## Security (do not ignore)

- Credentials currently embedded in connection string (improve: secure secret storage or token-based)
- No server-side proxy layer yet (browser connects directly)
- Do NOT deploy as-is to the public internet without:
  - HTTPS enforced
  - CORS hardening
  - Credential obfuscation or backend brokering

## Performance

- Lazy subscribe to queues only when opened
- Avoid deep message parsing unless expanded
- Future: virtualized message list (when volumes grow)

## Roadmap snapshot

Short-term:
- Azure Service Bus (peek / send / dead-letter)
- Message filtering & search
- Export / import messages (JSON)

Mid-term:
- Role-based permission model
- Pluggable auth providers
- Bulk operations (purge, move batch)

Long-term:
- Metrics panel (rates, DLQ trends)
- Scripting automation (custom actions)

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| Cannot connect (CORS error) | Missing Web STOMP plugin | Enable `rabbitmq_web_stomp` |
| Messages not appearing | Not subscribed / queue empty | Refresh or re-open queue |
| Connection saved but not loaded | Storage issue | Clear browser storage and retry |
| Stuck loading spinner | WebSocket blocked | Check browser console/network |

View browser console for STOMP frames to debug negotiation.

## Dev workflow

Clean install:
```bash
rm -rf node_modules package-lock.json
npm install
```

Type safety:
```bash
npx tsc --noEmit
```

(Recommend adding ESLint + Prettier for consistency.)

## Contributing

1. Fork + branch: `feat/<topic>` or `fix/<issue>`
2. Keep PRs small & focused
3. Add concise description + screenshot (if UI)
4. Squash merges recommended

Planned contribution templates: ISSUE_TEMPLATE + PULL_REQUEST_TEMPLATE.

## License

Licensed under the Non-Commercial Public Fork License (NCPFL). In short:

- Free for personal, study, research, or internal company use
- Public forks only (no private modified forks)
- No selling, sublicensing, paid hosting, or bundling into a paid product/SaaS
- Keep copyright + license text

Not OSI open source. See full terms in `LICENSE`.

---

Feedback and simple issue reports are welcome. Azure Service Bus support is in design; open an issue if you want to shape it early.
