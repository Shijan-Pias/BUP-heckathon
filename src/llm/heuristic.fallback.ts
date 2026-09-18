import { BatterySpec } from '../types/api';
import { DirectiveInterpretation } from '../types/directives';
import { LLMProvider } from './provider.interface';
import { validateAndSanitizeDirectives } from '../guardrails';

const BENGALI_DIGITS: Record<string, string> = {
  '০': '0',
  '১': '1',
  '২': '2',
  '৩': '3',
  '৪': '4',
  '৫': '5',
  '৬': '6',
  '৭': '7',
  '৮': '8',
  '৯': '9',
};

function normalizeBengaliNumerals(text: string): string {
  return text.replace(/[০-৯]/g, (d) => BENGALI_DIGITS[d] || d);
}

export class HeuristicLLMProvider implements LLMProvider {
  public name = 'HeuristicLLMProvider';

  public async interpretNotes(
    operatorNotes: string[],
    battery: BatterySpec
  ): Promise<DirectiveInterpretation[]> {
    const rawList: any[] = [];

    for (let i = 0; i < operatorNotes.length; i++) {
      const note = operatorNotes[i];
      const parsed = this.parseSingleNote(note, i, battery);
      rawList.push(parsed);
    }

    const guardrailResult = validateAndSanitizeDirectives(rawList, operatorNotes, battery);
    return guardrailResult.sanitized;
  }

  private parseSingleNote(text: string, index: number, battery: BatterySpec): any {
    const normalized = normalizeBengaliNumerals(text);
    const lower = normalized.toLowerCase();

    // 1. Check for solar reduction
    if (
      lower.includes('solar') ||
      lower.includes('সোলার') ||
      lower.includes('রোদ') ||
      lower.includes('pv') ||
      lower.includes('panel') ||
      lower.includes('cleaning') ||
      lower.includes('cloud') ||
      lower.includes('inverter')
    ) {
      const hours = this.extractHours(normalized);
      if (hours.length > 0) {
        let factor = 1.0;
        if (
          lower.includes('80% reduction') ||
          lower.includes('drop to 20%') ||
          lower.includes('one-fifth') ||
          lower.includes('৮০%')
        ) {
          factor = 0.2;
        } else if (
          lower.includes('25%') ||
          lower.includes('one-fourth') ||
          lower.includes('quarter') ||
          lower.includes('২৫%')
        ) {
          factor = 0.25;
        } else if (
          lower.includes('half') ||
          lower.includes('50%') ||
          lower.includes('অর্ধেক') ||
          lower.includes('৫০%')
        ) {
          factor = 0.5;
        } else {
          // Look for percentage
          const pctMatch = lower.match(/(\d+)%/);
          if (pctMatch) {
            const pct = parseInt(pctMatch[1], 10);
            if (
              lower.includes('reduction') ||
              lower.includes('cut') ||
              lower.includes('curtailed') ||
              lower.includes('drop by') ||
              lower.includes('কমে')
            ) {
              factor = Math.max(0, Math.min(1, (100 - pct) / 100));
            } else {
              factor = Math.max(0, Math.min(1, pct / 100));
            }
          }
        }

        return {
          note_index: index,
          applies: true,
          directive_type: 'solar_reduction',
          structured_adjustment: {
            hours,
            factor,
          },
          explanation: `Solar generation reduced during specified hours.`,
        };
      }
    }

    // 2. Check for battery charging restriction
    if (
      (lower.includes('charge') || lower.includes('charger') || lower.includes('charging') || lower.includes('চার্জ')) &&
      (lower.includes('isolated') ||
        lower.includes('maintenance') ||
        lower.includes('do not charge') ||
        lower.includes('prohibited') ||
        lower.includes('offline') ||
        lower.includes('বন্ধ') ||
        lower.includes('করা যাবে না') ||
        lower.includes('disabled') ||
        lower.includes('unavailable') ||
        lower.includes('inspect')) &&
      !lower.includes('discharge') &&
      !lower.includes('ডিসচার্জ')
    ) {
      const hours = this.extractHours(normalized);
      if (hours.length > 0) {
        return {
          note_index: index,
          applies: true,
          directive_type: 'no_charge_window',
          structured_adjustment: {
            hours,
          },
          explanation: `Battery charging disabled during maintenance window.`,
        };
      }
    }

    // 3. Check for battery discharging restriction
    if (
      (lower.includes('discharge') ||
        lower.includes('discharging') ||
        lower.includes('outflow') ||
        lower.includes('ডিসচার্জ')) &&
      (lower.includes('do not') ||
        lower.includes('must not') ||
        lower.includes('disabled') ||
        lower.includes('prohibited') ||
        lower.includes('prevent') ||
        lower.includes('zero') ||
        lower.includes('বন্ধ') ||
        lower.includes('করা যাবে না') ||
        lower.includes('testing') ||
        lower.includes('relay'))
    ) {
      const hours = this.extractHours(normalized);
      if (hours.length > 0) {
        return {
          note_index: index,
          applies: true,
          directive_type: 'no_discharge_window',
          structured_adjustment: {
            hours,
          },
          explanation: `Battery discharging disabled during protection window.`,
        };
      }
    }

    // 4. Check for minimum battery reserve
    if (
      (lower.includes('battery') ||
        lower.includes('stored') ||
        lower.includes('reserve') ||
        lower.includes('ব্যাটারি') ||
        lower.includes('সংরক্ষিত') ||
        lower.includes('রিজার্ভ')) &&
      (lower.includes('at least') ||
        lower.includes('keep') ||
        lower.includes('remain') ||
        lower.includes('maintain') ||
        lower.includes('above') ||
        lower.includes('কমপক্ষে') ||
        lower.includes('ন্যূনতম') ||
        lower.includes('রাখতে হবে')) &&
      !lower.includes('grid') &&
      !lower.includes('import') &&
      !lower.includes('intake') &&
      !lower.includes('গ্রিড')
    ) {
      const hours = this.extractHours(normalized);
      if (hours.length > 0) {
        let minKwh = 0;
        const pctMatch = lower.match(/(\d+)%/);
        const kwhMatch = lower.match(/(\d+(?:\.\d+)?)\s*(?:kwh|কিলোওয়াট|কিলোওয়াট-আওয়ার)/);

        if (pctMatch) {
          const pct = parseFloat(pctMatch[1]);
          minKwh = (pct / 100) * battery.capacity_kwh;
        } else if (kwhMatch) {
          minKwh = parseFloat(kwhMatch[1]);
        }

        if (minKwh > 0) {
          return {
            note_index: index,
            applies: true,
            directive_type: 'minimum_battery_reserve',
            structured_adjustment: {
              hours,
              minimum_energy_kwh: minKwh,
            },
            explanation: `Minimum battery reserve of ${minKwh} kWh required during window.`,
          };
        }
      }
    }

    // 5. Check for max grid window
    if (
      lower.includes('grid') ||
      lower.includes('feeder') ||
      lower.includes('transformer') ||
      lower.includes('substation') ||
      lower.includes('import') ||
      lower.includes('intake') ||
      lower.includes('purchase') ||
      lower.includes('গ্রিড')
    ) {
      const hours = this.extractHours(normalized);
      const kwhMatch = lower.match(/(\d+(?:\.\d+)?)\s*(?:kwh|কিলোওয়াট|কিলোওয়াট-আওয়ার)/);
      if (hours.length > 0 && kwhMatch) {
        const maxGridKwh = parseFloat(kwhMatch[1]);
        return {
          note_index: index,
          applies: true,
          directive_type: 'max_grid_window',
          structured_adjustment: {
            hours,
            max_grid_kwh: maxGridKwh,
          },
          explanation: `Grid import capped at ${maxGridKwh} kWh during window.`,
        };
      }
    }

    // Default to no_op
    return {
      note_index: index,
      applies: false,
      directive_type: 'no_op',
      structured_adjustment: null,
      explanation: `This note does not affect today's energy schedule.`,
    };
  }

  private extractHours(text: string): number[] {
    const lower = text.toLowerCase();

    // Bengali phrases like "বিকাল ৩টা থেকে ৫টা", "সকাল ৮টা থেকে বেলা ১১টা", "সন্ধ্যা ৬টা থেকে রাত ৯টা"
    const bnMatch = lower.match(/(সকাল|বেলা|দুপুর|বিকাল|সন্ধ্যা|রাত)?\s*(\d{1,2})\s*টা(?:\s*(?:থেকে|হতে|পর্যন্ত|-)\s*(?:সকাল|বেলা|দুপুর|বিকাল|সন্ধ্যা|রাত)?\s*(\d{1,2})\s*টা)/);
    if (bnMatch) {
      const period = bnMatch[1] || '';
      let s = parseInt(bnMatch[2], 10);
      let e = parseInt(bnMatch[3], 10);

      const isPm = period === 'দুপুর' || period === 'বিকাল' || period === 'সন্ধ্যা' || period === 'রাত';
      if (isPm && s < 12) s += 12;
      if (isPm && e < 12) e += 12;

      const result: number[] = [];
      for (let h = s; h < e; h++) {
        if (h >= 0 && h < 24) result.push(h);
      }
      if (result.length > 0) return result;
    }

    // Pattern: "from noon until 2 PM" or "noon to 2 PM"
    if (
      lower.includes('noon until 2 pm') ||
      lower.includes('noon to 2 pm') ||
      lower.includes('12 pm until 2 pm') ||
      lower.includes('12:00 until 14:00')
    ) {
      return [12, 13];
    }
    if (
      lower.includes('10 am until noon') ||
      lower.includes('10 am to 12 pm') ||
      lower.includes('10:00 until 12:00')
    ) {
      return [10, 11];
    }

    // Check 24-hour pattern "13:00 and 15:00" or "13:00 to 15:00" or "15:00-17:00"
    const h24Match = lower.match(/(\d{1,2}):00\s*(?:and|to|until|-)\s*(\d{1,2}):00/);
    if (h24Match) {
      const s = parseInt(h24Match[1], 10);
      const e = parseInt(h24Match[2], 10);
      const result: number[] = [];
      for (let h = s; h < e; h++) {
        if (h >= 0 && h < 24) result.push(h);
      }
      return result;
    }

    // General pattern: from X (AM/PM) until/to Y (AM/PM) or "X PM - Y PM"
    const timeMatch = lower.match(/(\d{1,2})(?::00)?\s*(am|pm)?\s*(?:until|to|and|-)\s*(\d{1,2})(?::00)?\s*(am|pm)/);
    if (timeMatch) {
      let s = parseInt(timeMatch[1], 10);
      const sPeriod = timeMatch[2];
      let e = parseInt(timeMatch[3], 10);
      const ePeriod = timeMatch[4];

      const endIsPm = ePeriod === 'pm';
      const startIsPm = sPeriod
        ? sPeriod === 'pm'
        : endIsPm && s <= e
        ? endIsPm
        : s >= 12
        ? true
        : endIsPm;

      if (startIsPm && s < 12) s += 12;
      if (!startIsPm && s === 12) s = 0;

      if (endIsPm && e < 12) e += 12;
      if (!endIsPm && e === 12) e = 0;

      const result: number[] = [];
      for (let h = s; h < e; h++) {
        if (h >= 0 && h < 24) result.push(h);
      }
      return result;
    }

    return [];
  }
}
