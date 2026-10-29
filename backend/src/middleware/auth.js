import jwt from 'jsonwebtoken';
import { HttpError } from '../utils/http.js';
import { userSedeIds } from '../services/sedes.js';

// El gateway de la intranet (intranet-api-auth) autentica al usuario, valida el permiso de la ruta
// y reenvía un JWT de corta duración en `x-auth-token`, firmado con SERVICES_SECRET_KEY.
// Su payload es el usuario de la intranet: { id, email, cedula, active }.
// Este servicio NO debe exponerse fuera de la red interna: sin el gateway no hay quien firme el token.
function verifyIntranetToken(req) {
  const secret = process.env.SERVICES_SECRET_KEY;
  if (!secret) {
    console.error('SERVICES_SECRET_KEY no está definido');
    throw new HttpError(500, 'Servicio mal configurado');
  }

  const token = req.header('x-auth-token');
  if (!token) throw new HttpError(401, 'No autenticado');

  let payload;
  try {
    payload = jwt.verify(token, secret, { algorithms: ['HS256'] });
  } catch {
    throw new HttpError(401, 'Sesión inválida o expirada');
  }

  const { id, email, active } = payload;
  if (!Number.isInteger(id) || id <= 0 || typeof email !== 'string' || !email) {
    throw new HttpError(401, 'Token sin identidad de usuario');
  }
  if (active === false) throw new HttpError(403, 'Usuario inactivo');
  return { id, email };
}

export async function authenticate(req, res, next) {
  try {
    const { id, email } = verifyIntranetToken(req);

    // Permisos por sede: los que ya existen en la intranet (vista v_permiso_sede). Todas las sedes con permiso sirven para
    // consultar eventos ya creados; cuáles se pueden ofrecer hoy para crear eventos nuevos se calcula solo donde hace falta.
    req.user = { id, email, sedeIds: await userSedeIds(id) };
    next();
  } catch (err) {
    next(err);
  }
}
