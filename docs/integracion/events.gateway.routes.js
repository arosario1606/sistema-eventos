// COPIAR A: intranet-api-auth/src/routes/events.gateway.routes.js
// y registrarlo en intranet-api-auth/src/index.js:
//   import eventsRoutes from "./routes/events.gateway.routes.js";
//   app.use(eventsRoutes);
//
// Mismo patrón que lottery.gateway.routes.js y gss-credit.gateway.routes.js: valida la cookie, comprueba el permiso de la
// ruta exacta en Routes_backend / Routes_backend_child y reenvía al servicio con x-auth-token.
import { Router } from "express";
import proxy from "express-http-proxy";
import gateWayController from "../controllers/gateway.controller.js";
import { checkAuth } from "../middlewares/checkAuth.js";

const router = Router();

// Puerto del servicio de eventos en la red Docker (3008 es el de sorteos). Acordado: 3009. Confirmar con el administrador que siga libre.
const EVENTS_SERVICE_PORT = 3009;

router.use("/apiv1/events-service", checkAuth, async (req, res, next) => {
  // Ruta padre registrada en Routes_backend (ver seed-rutas-eventos.js)
  const route = "/events-service";

  const response = await gateWayController.gateWayController(req, res, route);

  // Sin acceso: gateWayController ya respondió 401/403
  if (response && response.token === undefined) {
    console.log("SIN ACCESO A LA RUTA:", route + req.path);
    return;
  }

  proxy(`http://${process.env.DOCKER_SERVER_IP}:${EVENTS_SERVICE_PORT}/`, {
    // Las subidas de archivos (CSV, multipart/form-data) deben pasar tal cual: con el valor por defecto
    // express-http-proxy lee el cuerpo como texto y lo estropea (el servicio falla con "Unexpected end of form").
    // El resto de peticiones (JSON) sigue con el comportamiento normal.
    parseReqBody: !req.is("multipart/form-data"),
    proxyReqOptDecorator: (proxyReqOpts) => {
      proxyReqOpts.headers["x-auth-token"] = response.token;
      return proxyReqOpts;
    },
  })(req, res, next);
});

export default router;
