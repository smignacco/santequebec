import { Module } from '@nestjs/common';
import { WebexService } from './webex.service';

@Module({
  providers: [WebexService],
  exports: [WebexService]
})
export class WebexModule {}
