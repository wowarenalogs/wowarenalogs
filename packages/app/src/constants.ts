import { app } from 'electron';

export const BASE_REMOTE_URL = app.isPackaged ? 'https://desktop.wowarenalogs.com' : 'http://localhost:3000';
