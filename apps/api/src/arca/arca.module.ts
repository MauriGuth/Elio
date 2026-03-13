import { Module } from '@nestjs/common';
import { ArcaService } from './arca.service';
import { ArcaController } from './arca.controller';
import { ArcaWsaaService } from './arca.wsaa.service';
import { ArcaWsfev1Service } from './arca.wsfev1.service';
import { ArcaFiscalService } from './arca.fiscal.service';

@Module({
  controllers: [ArcaController],
  providers: [ArcaService, ArcaWsaaService, ArcaWsfev1Service, ArcaFiscalService],
  exports: [ArcaService, ArcaFiscalService],
})
export class ArcaModule {}
