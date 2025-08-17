// tiny bootstrap so "npm run dev" just works
import { createServer } from './mock_wallet';
const port = Number(process.env.PORT || 3001);
const server = createServer();
server.listen(port, () => {
  console.log(`[server] listening on http://localhost:${port}`);
});
