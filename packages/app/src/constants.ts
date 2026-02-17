import { app } from 'electron';

export const BASE_REMOTE_URL = !app || app.isPackaged ? 'https://wowarenalogs.com' : 'http://localhost:3000';
