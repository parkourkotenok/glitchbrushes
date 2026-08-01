export interface ControlHelpOption {
  value: string;
  label: string;
  description: string;
}

export interface ControlHelp {
  id: string;
  title: string;
  short: string;
  description: string;
  low?: string;
  high?: string;
  performance?: string;
  output?: string;
  example?: string;
  defaultValue?: string;
  related?: string[];
  keywords?: string[];
  options?: ReadonlyArray<ControlHelpOption>;
}
