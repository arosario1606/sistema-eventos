import dotenv from 'dotenv';
import { createApp } from './app.js';
import { checkIntranetViews } from './services/sedes.js';

dotenv.config();

const PORT = process.env.PORT || 3000;
createApp().listen(PORT, () => {
  console.log(`Servicio de eventos escuchando en el puerto ${PORT}`);
  checkIntranetViews();
});
