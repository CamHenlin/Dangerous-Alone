#!/usr/bin/env node
import path from 'node:path';
import { cmdAll, cmdBanks, cmdInfo, cmdRomMap, cmdTables } from './commands.js';
import { cmdGraphics, PATTERN_BLOCKS_PATH } from './graphics.js';
import { cmdOverworld, OVERWORLD_SCHEMA_PATH } from './overworld.js';
import { cmdDungeons, DUNGEONS_SCHEMA_PATH } from './dungeons.js';
import { cmdCaves, CAVES_SCHEMA_PATH } from './caves.js';
import { cmdAudio, AUDIO_SCHEMA_PATH } from './audio.js';
import { cmdEnding, ENDING_SCHEMA_PATH } from './ending.js';
import { cmdDemo, DEMO_SCHEMA_PATH } from './demo.js';
import { DEFAULT_ROM_PATH, RANGES_SCHEMA_PATH } from '../shared/paths.js';

const USAGE = `Usage:
  npm run extract -- <command> [options]

Commands:
  info              Print iNES header + PRG hashes
  banks             Split PRG into assets/extracted/banks/bank_N.bin
  tables            Dump configured ranges to assets/extracted/tables/
  rom-map           Write assets/extracted/rom_map.json
  graphics          Decode pattern blocks → PNG sheets + palettes.json
  overworld         Expand overworld map → JSON + stitched PNG
  dungeons          Expand levels 1–9 (Q1+Q2) → JSON + room/level PNGs
  caves             Dump cave/shop tables → tables/caves.json
  audio             Dump music/SFX sequences → audio/audio.json
  ending            Dump mode $13 text + credits → play/ending.json
  demo              Dump mode $00 attract tables + crawl text + title/story PNGs
  all               banks + tables + rom-map + graphics + overworld + dungeons + caves + audio + ending + demo

Options:
  --rom <path>      ROM path (default: ${path.basename(DEFAULT_ROM_PATH)})
  --schema <path>   Range schema JSON (default: assets/schema/rom_ranges.json)
  --patterns <path> Pattern block schema (default: assets/schema/pattern_blocks.json)
  --overworld <path> Overworld schema (default: assets/schema/overworld.json)
  --dungeons <path> Dungeons schema (default: assets/schema/dungeons.json)
  --caves <path>    Caves schema (default: assets/schema/caves.json)
  --audio <path>    Audio schema (default: assets/schema/audio.json)
  --ending <path>   Ending schema (default: assets/schema/ending.json)
  --demo <path>     Demo schema (default: assets/schema/demo.json)
  --json            (info only) machine-readable output
`;

function parseArgs(argv) {
  const args = {
    command: null,
    romPath: DEFAULT_ROM_PATH,
    schemaPath: RANGES_SCHEMA_PATH,
    patternsPath: PATTERN_BLOCKS_PATH,
    overworldPath: OVERWORLD_SCHEMA_PATH,
    dungeonsPath: DUNGEONS_SCHEMA_PATH,
    cavesPath: CAVES_SCHEMA_PATH,
    audioPath: AUDIO_SCHEMA_PATH,
    endingPath: ENDING_SCHEMA_PATH,
    demoPath: DEMO_SCHEMA_PATH,
    json: false,
  };

  const rest = [...argv];
  if (rest.length === 0 || rest[0] === '-h' || rest[0] === '--help') {
    return { ...args, command: 'help' };
  }

  args.command = rest.shift();

  while (rest.length) {
    const token = rest.shift();
    if (token === '--rom') {
      args.romPath = path.resolve(rest.shift() ?? '');
    } else if (token === '--schema') {
      args.schemaPath = path.resolve(rest.shift() ?? '');
    } else if (token === '--patterns') {
      args.patternsPath = path.resolve(rest.shift() ?? '');
    } else if (token === '--overworld') {
      args.overworldPath = path.resolve(rest.shift() ?? '');
    } else if (token === '--dungeons') {
      args.dungeonsPath = path.resolve(rest.shift() ?? '');
    } else if (token === '--caves') {
      args.cavesPath = path.resolve(rest.shift() ?? '');
    } else if (token === '--audio') {
      args.audioPath = path.resolve(rest.shift() ?? '');
    } else if (token === '--ending') {
      args.endingPath = path.resolve(rest.shift() ?? '');
    } else if (token === '--demo') {
      args.demoPath = path.resolve(rest.shift() ?? '');
    } else if (token === '--json') {
      args.json = true;
    } else if (token === '-h' || token === '--help') {
      args.command = 'help';
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
  }

  return args;
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }

  try {
    switch (args.command) {
      case 'help':
        console.log(USAGE);
        break;
      case 'info':
        cmdInfo({ romPath: args.romPath, json: args.json });
        break;
      case 'banks':
        cmdBanks({ romPath: args.romPath });
        break;
      case 'tables':
        cmdTables({ romPath: args.romPath, schemaPath: args.schemaPath });
        break;
      case 'rom-map':
        cmdRomMap({ romPath: args.romPath, schemaPath: args.schemaPath });
        break;
      case 'graphics':
        cmdGraphics({ romPath: args.romPath, schemaPath: args.patternsPath });
        break;
      case 'overworld':
        cmdOverworld({ romPath: args.romPath, schemaPath: args.overworldPath });
        break;
      case 'dungeons':
        cmdDungeons({ romPath: args.romPath, schemaPath: args.dungeonsPath });
        break;
      case 'caves':
        cmdCaves({ romPath: args.romPath, schemaPath: args.cavesPath });
        break;
      case 'audio':
        cmdAudio({ romPath: args.romPath, schemaPath: args.audioPath });
        break;
      case 'ending':
        cmdEnding({ romPath: args.romPath, schemaPath: args.endingPath });
        break;
      case 'demo':
        cmdDemo({ romPath: args.romPath, schemaPath: args.demoPath });
        break;
      case 'all':
        cmdAll({ romPath: args.romPath, schemaPath: args.schemaPath });
        console.log('');
        cmdGraphics({ romPath: args.romPath, schemaPath: args.patternsPath });
        console.log('');
        cmdOverworld({ romPath: args.romPath, schemaPath: args.overworldPath });
        console.log('');
        cmdDungeons({ romPath: args.romPath, schemaPath: args.dungeonsPath });
        console.log('');
        cmdCaves({ romPath: args.romPath, schemaPath: args.cavesPath });
        console.log('');
        cmdAudio({ romPath: args.romPath, schemaPath: args.audioPath });
        console.log('');
        cmdEnding({ romPath: args.romPath, schemaPath: args.endingPath });
        console.log('');
        cmdDemo({ romPath: args.romPath, schemaPath: args.demoPath });
        break;
      default:
        console.error(`Unknown command: ${args.command}\n`);
        console.error(USAGE);
        process.exitCode = 1;
    }
  } catch (err) {
    console.error(`extract failed: ${err.message}`);
    process.exitCode = 1;
  }
}

main();
