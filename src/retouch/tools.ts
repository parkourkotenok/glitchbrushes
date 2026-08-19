import type { Tool } from '../types';
import type { RetouchTool } from './types';

export const RETOUCH_TOOLS: RetouchTool[] = [
  'smudge',
  'finger',
  'blur',
  'sharpen',
  'restore',
  'eraser',
];

export function isRetouchTool(tool: Tool): tool is RetouchTool {
  return RETOUCH_TOOLS.includes(tool as RetouchTool);
}
