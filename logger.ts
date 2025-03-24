import {FBLOG_LEVEL} from "./src/enum/fblog-level.enum";

export class FBLogger {
  name = '[FB]';
  level: FBLOG_LEVEL = FBLOG_LEVEL.ERROR;

  setLogLevel(level: FBLOG_LEVEL) {
    this.level = level;
  }

  log(message: string) {
    if (this.level <= FBLOG_LEVEL.INFO) {
      console.log(`${this.name} INFO ${message}`)
    }
  }

  debug(message: string) {
    if (this.level <= FBLOG_LEVEL.DEBUG) {
      console.log(`${this.name} DEBUG ${message}`)
    }
  }

  warn(message: string) {
    if (this.level <= FBLOG_LEVEL.WARN) {
      console.log(`${this.name} WARN ${message}`)
    }
  }

  error(message: string) {
    if (this.level <= FBLOG_LEVEL.ERROR) {
      console.error(`${this.name} ERROR ${message}`)
    }
  }
}
