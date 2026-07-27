import express from 'express';
import next from 'next';
import cookieParser from 'cookie-parser';
import apiRouter from './routes/api';

const port = parseInt(process.env.PORT || '3000', 10);
const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = express();

  // Basic middleware
  server.use(express.json());
  server.use(express.urlencoded({ extended: true }));
  server.use(cookieParser());

  // Log requests
  server.use((req, res, nextFn) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    nextFn();
  });

  // Backend API Router
  server.use('/api', apiRouter);

  // Next.js page routing fallback to Next.js handler
  server.use((req, res) => {
    return handle(req, res);
  });

  server.listen(port, '0.0.0.0', () => {
    console.log(`> Ready on http://0.0.0.0:${port}`);
  });
}).catch((err) => {
  console.error('Error starting server:', err);
  process.exit(1);
});
