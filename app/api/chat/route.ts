import { atender } from '@/lib/chat/ruta';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const POST = (req: Request) => atender(req, 'costeo');
