import { app } from 'electron';

export const NEXT_SERVER_PORT = 3088;
export const BASE_REMOTE_URL =
  !app || app.isPackaged ? `http://127.0.0.1:${NEXT_SERVER_PORT}` : 'http://localhost:3000';
