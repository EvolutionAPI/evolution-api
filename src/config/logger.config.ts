import dayjs from 'dayjs';
import fs from 'fs';

import { configService, Log } from './env.config';
const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'));

const formatDateLog = (timestamp: number) =>
  dayjs(timestamp)
    .toDate()
    .toString()
    .replace(/\sGMT.+/, '');

enum Color {
  LOG = '\x1b[32m',
  INFO = '\x1b[34m',
  WARN = '\x1b[33m',
  ERROR = '\x1b[31m',
  DEBUG = '\x1b[36m',
  VERBOSE = '\x1b[37m',
  DARK = '\x1b[30m',
}

enum Command {
  RESET = '\x1b[0m',
  BRIGHT = '\x1b[1m',
  UNDERSCORE = '\x1b[4m',
}

enum Level {
  LOG = Color.LOG + '%s' + Command.RESET,
  DARK = Color.DARK + '%s' + Command.RESET,
  INFO = Color.INFO + '%s' + Command.RESET,
  WARN = Color.WARN + '%s' + Command.RESET,
  ERROR = Color.ERROR + '%s' + Command.RESET,
  DEBUG = Color.DEBUG + '%s' + Command.RESET,
  VERBOSE = Color.VERBOSE + '%s' + Command.RESET,
}

enum Type {
  LOG = 'LOG',
  WARN = 'WARN',
  INFO = 'INFO',
  DARK = 'DARK',
  ERROR = 'ERROR',
  DEBUG = 'DEBUG',
  VERBOSE = 'VERBOSE',
}

enum Background {
  LOG = '\x1b[42m',
  INFO = '\x1b[44m',
  WARN = '\x1b[43m',
  DARK = '\x1b[40m',
  ERROR = '\x1b[41m',
  DEBUG = '\x1b[46m',
  VERBOSE = '\x1b[47m',
}

const MAX_LOG_LENGTH = 1000;

export class Logger {
  private readonly configService = configService;
  private context: string;

  // Cache estático dos níveis permitidos — evita alocar array a cada log
  private static allowedTypes: Set<Type> | null = null;
ou
  constructor(context = 'Logger') {
    this.context = context;
  }

  private instance = null;

  public setContext(value: string) {
    this.context = value;
  }

  public setInstance(value: string) {
    this.instance = value;
  }

  private static getAllowedTypes(): Set<Type> {
    if (!Logger.allowedTypes) {
      Logger.allowedTypes = new Set<Type>();
      configService.get<Log>('LOG').LEVEL.forEach((level) => {
        Logger.allowedTypes.add(Type[level]);
      });
    }
    return Logger.allowedTypes;
  }

  /**
   * Serializa objeto para string com limite de tamanho.
   * Garante que console.log receba uma STRING (primitiva) e não
   * uma REFERÊNCIA ao objeto original — evitando retenção de memória
   * no buffer do stdout.
   */
  private static safeStringify(value: any): string {
    try {
      const str = JSON.stringify(value);
      if (str.length > MAX_LOG_LENGTH) {
        return str.substring(0, MAX_LOG_LENGTH) + `...[truncated ${str.length - MAX_LOG_LENGTH} chars]`;
      }
      return str;
    } catch {
      return '[Circular or unserializable object]';
    }
  }

  private console(value: any, type: Type) {

    if (!Logger.getAllowedTypes().has(type)) return;

    const typeValue = typeof value;

    // Converter objeto para string ANTES de passar ao console.log
    // para não reter referência ao objeto original no buffer do stdout
    const logOutput = typeValue === 'object' ? Logger.safeStringify(value) : value;

    if (configService.get<Log>('LOG').COLOR) {
      console.log(
        Command.BRIGHT + Level[type],
        '[Evolution API]',
        Command.BRIGHT + Color[type],
        this.instance ? `[${this.instance}]` : '',
        Command.BRIGHT + Color[type],
        `v${packageJson.version}`,
        Command.BRIGHT + Color[type],
        process.pid.toString(),
        Command.RESET,
        Command.BRIGHT + Color[type],
        '-',
        Command.BRIGHT + Color.VERBOSE,
        `${formatDateLog(Date.now())}  `,
        Command.RESET,
        Color[type] + Background[type] + Command.BRIGHT,
        `${type} ` + Command.RESET,
        Color.WARN + Command.BRIGHT,
        `[${this.context}]` + Command.RESET,
        Color[type] + Command.BRIGHT,
        `[${typeValue}]` + Command.RESET,
        Color[type],
        logOutput,
        Command.RESET,
      );
    } else {
      console.log(
        '[Evolution API]',
        this.instance ? `[${this.instance}]` : '',
        process.pid.toString(),
        '-',
        `${formatDateLog(Date.now())}  `,
        `${type} `,
        `[${this.context}]`,
        `[${typeValue}]`,
        logOutput,
      );
    }
  }

  public log(value: any) {
    this.console(value, Type.LOG);
  }

  public info(value: any) {
    this.console(value, Type.INFO);
  }

  public warn(value: any) {
    this.console(value, Type.WARN);
  }

  public error(value: any) {
    this.console(value, Type.ERROR);
  }

  public verbose(value: any) {
    this.console(value, Type.VERBOSE);
  }

  public debug(value: any) {
    this.console(value, Type.DEBUG);
  }

  public dark(value: any) {
    this.console(value, Type.DARK);
  }
}
