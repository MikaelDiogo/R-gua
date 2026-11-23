import { Controller, Get } from '@nestjs/common';
import { UserId } from '../auth/auth.guard';
import { RadarService } from './radar.service';

@Controller('v1/radar')
export class RadarController {
  constructor(private readonly radar: RadarService) {}

  /** Editais abertos que combinam com o que a pessoa pesquisou no chat e vigia nos monitores. Exige sessão. */
  @Get('for-you')
  forYou(@UserId() userId: string) {
    return this.radar.forYou(userId);
  }
}
