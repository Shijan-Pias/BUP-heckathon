declare module 'javascript-lp-solver' {
  export interface Model {
    optimize: string;
    opType: 'min' | 'max';
    constraints: Record<string, any>;
    variables: Record<string, any>;
    ints?: Record<string, number>;
  }

  export interface Solution {
    feasible?: boolean;
    result?: number;
    bounded?: boolean;
    isIntegral?: boolean;
    [key: string]: any;
  }

  export function Solve(model: Model): Solution;

  const solver: {
    Solve: (model: Model) => Solution;
  };

  export default solver;
}
