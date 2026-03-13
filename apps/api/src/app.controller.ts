import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  root() {
    return { ok: true, message: 'Nova API', docs: 'Usa la app web en su URL (ej. localhost:3000); esta API es para llamadas desde el frontend.' };
  }
}
