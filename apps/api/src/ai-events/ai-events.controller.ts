import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AIEventsService } from './ai-events.service';
import { CreateAIEventDto } from './dto/create-ai-event.dto';
import { TakeActionDto } from './dto/take-action.dto';

@Controller('ai-events')
@UseGuards(JwtAuthGuard)
export class AIEventsController {
  constructor(private readonly aiEventsService: AIEventsService) {}

  @Get()
  findAll(
    @Query('type') type?: string,
    @Query('severity') severity?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.aiEventsService.findAll({
      type,
      severity,
      status,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get('active')
  getActive() {
    return this.aiEventsService.getActive();
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.aiEventsService.findById(id);
  }

  @Post()
  create(@Body() dto: CreateAIEventDto) {
    return this.aiEventsService.create(dto);
  }

  @Post('predictions')
  generatePredictions() {
    return this.aiEventsService.generatePredictions();
  }

  @Post('analyze-report')
  analyzeReport(
    @Body()
    body: {
      dateFrom?: string;
      dateTo?: string;
      locationId?: string;
      reportType?: string;
    },
  ) {
    return this.aiEventsService.analyzeReport(body);
  }

  @Post('analyze-alerts')
  analyzeAlerts() {
    return this.aiEventsService.analyzeAlerts();
  }

  @Post(':id/action')
  takeAction(
    @Param('id') id: string,
    @Body() dto: TakeActionDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.aiEventsService.takeAction(id, dto, userId);
  }

  @Post(':id/dismiss')
  dismiss(@Param('id') id: string) {
    return this.aiEventsService.dismiss(id);
  }

  @Post('transcribe-audio')
  async transcribeAudio(
    @Body() body: { audio: string; language?: string; fileExt?: string; prompt?: string },
  ) {
    if (!body.audio) {
      throw new BadRequestException('Audio data is required');
    }
    return this.aiEventsService.transcribeAudio(
      body.audio,
      body.language ?? 'es',
      body.fileExt ?? 'webm',
      body.prompt,
    );
  }
}
