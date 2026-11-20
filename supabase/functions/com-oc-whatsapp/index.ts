import { admin } from "../_shared/db.ts";
import { manejar, responder } from "./whatsapp.ts";

// Solo n8n llama aquí, con x-oc-whatsapp-secreto (spec §4). Sin CORS: no se llama desde el navegador.
Deno.serve((req) => responder(req, { db: admin, manejar }));
