export type ParsedClass = {
  day: string;
  startTime: string;
  endTime: string;
  courseCode: string;
  classType: 'Theory' | 'Lab';
  location?: string;
  // Optional metadata populated by the FFCS parser (back-compat: other callers can ignore)
  rawType?: string;        // ETH | TH | ELA | ...
  courseName?: string;     // Readable name e.g. "Database Systems"
  slots?: string[];        // Merged slot ids e.g. ["L33", "L34"]
};

// Regex patterns for the new format
// Cell format: SLOT-CODE-TYPE-ROOM-???
// Example: A1-CBS1007-ETH-PRP330-UGS
const CELL_REGEX = /^([A-Z0-9]+)-([A-Z]{2,}[0-9]{3,})-([A-Z]+)-([A-Z0-9]+)-([A-Z]+)$/;

// Time token: 08:00, 19:50
const TIME_REGEX = /^([0-9]{1,2}:[0-9]{2})$/;

const DAY_REGEX = /^(MON|TUE|WED|THU|FRI|SAT|SUN)$/i;

function tokenize(line: string): string[] {
  // Split by tabs primarily, or multiple spaces if tabs aren't present
  if (line.includes('\t')) {
    return line.split('\t').map(s => s.trim());
  }
  // Fallback to splitting by 2+ spaces
  return line.trim().split(/\s{2,}/);
}

function isTimeToken(token: string) {
  return TIME_REGEX.test(token);
}

export function parseTimetable(rawText: string): ParsedClass[] {
  const lines = rawText
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0);

  // Maps from column index to time string
  // Note: We need separate maps for Theory and Lab because they might have different slot structures
  const theoryStart: Record<number, string> = {};
  const theoryEnd: Record<number, string> = {};
  const labStart: Record<number, string> = {};
  const labEnd: Record<number, string> = {};

  const results: ParsedClass[] = [];

  // State to track if we are currently parsing a specific section's header
  // parsingHeaderFor: 'THEORY' | 'LAB' | null

  // Pass 1: Parse Headers to build time maps
  for (let i = 0; i < lines.length; i++) {
    const tokens = tokenize(lines[i]);
    if (tokens.length < 2) continue;

    const firstToken = tokens[0].toUpperCase();

    // Identify Theory Start Row
    // "HEORY Start ..." or "THEORY Start ..."
    if ((firstToken.includes('EORY') || firstToken === 'THEORY') && tokens[1].toUpperCase() === 'START') {
      tokens.slice(2).forEach((token, idx) => {
        if (isTimeToken(token)) {
          theoryStart[idx] = token; // idx 0 in times array corresponds to column 2 in tokens (0,1,2...)
        }
      });
      continue;
    }

    // Identify Theory End Row
    if (firstToken === 'END' && Object.keys(theoryStart).length > 0 && Object.keys(theoryEnd).length === 0) {
      // Assuming Theory End follows Theory Start immediately or close enough
      // We can distinguish from Lab End by checking if we already have Lab Start? 
      // Better heuristic: match with the one we just parsed.
      tokens.slice(1).forEach((token, idx) => {
        if (isTimeToken(token)) {
          theoryEnd[idx] = token;
        }
      });
      continue;
    }

    // Identify Lab Start Row
    if (firstToken === 'LAB' && tokens[1].toUpperCase() === 'START') {
      tokens.slice(2).forEach((token, idx) => {
        if (isTimeToken(token)) {
          labStart[idx] = token;
        }
      });
      continue;
    }

    // Identify Lab End Row
    if (firstToken === 'END' && Object.keys(labStart).length > 0 && Object.keys(labEnd).length === 0) {
      tokens.slice(1).forEach((token, idx) => {
        if (isTimeToken(token)) {
          labEnd[idx] = token;
        }
      });
      continue;
    }

    // Fallback: If "END" appears and we already have theoryEnd, it might be labEnd
    if (firstToken === 'END' && Object.keys(theoryEnd).length > 0) {
      tokens.slice(1).forEach((token, idx) => {
        if (isTimeToken(token)) {
          labEnd[idx] = token;
        }
      });
    }
  }

  // Pass 2: Parse Data Rows
  for (let i = 0; i < lines.length; i++) {
    const tokens = tokenize(lines[i]);
    if (tokens.length === 0) continue;

    const firstToken = tokens[0].toUpperCase();

    if (DAY_REGEX.test(firstToken)) {
      const day = firstToken;

      // DAY THEORY ...
      // The tokens might look like: ["MON", "THEORY", "A1-...", "F1-...", ...]
      if (tokens[1] && tokens[1].toUpperCase().includes('EORY')) {
        const items = tokens.slice(2);
        let timeColIndex = 0;

        items.forEach(item => {
          // Skip Lunch or empty placeholders
          if (item.toUpperCase() === 'LUNCH' || item === '-') {
            // Even if we skip, we might need to verify if "Lunch" consumes a time slot index?
            // In the provided data: 
            // Header: 08:00 ... 12:00 - Lunch 14:00 ...
            // The empty column "-" seems to be before Lunch.
            // It seems simpler to increment timeColIndex for every token found, as they align with header columns.
            // But we should check if header maps have this index.
          }

          // Parse Cell
          // Expected: A1-CBS1007-ETH-PRP330-UGS
          const match = item.match(CELL_REGEX);
          if (match) {
            // const slot = match[1];
            const code = match[2];
            const typeCode = match[3];
            const room = match[4];
            // const group = match[5];

            // Determine Class Type
            // ETH -> Embedded Theory? 
            // TH -> Theory
            // If it's in the THEORY row, let's call it Theory.
            const classType = 'Theory';

            const start = theoryStart[timeColIndex];
            const end = theoryEnd[timeColIndex];

            if (start && end) {
              results.push({
                day: day,
                startTime: start,
                endTime: end,
                courseCode: code,
                classType: classType,
                location: room
              });
            }
          }

          // Alignment: logic assumes tokens map 1:1 to the startTimes array indices
          // NOTE: The "Lunch" token in data row might align with "Lunch" in header row.
          // If our tokenizer preserves "Lunch" as a token, and our header parser preserved "Lunch" or skipped it?
          // In pass 1, we gathered `startTimes = tokens.slice(2).filter(isTimeToken)`.
          // So `theoryStart` keys are 0, 1, 2, 3... (packed).
          // In pass 2, `tokens.slice(2)` includes "Lunch" and "-".
          // We need to keep a separate "timeIndex" that only increments when we encounter a column that HAS a corresponding time in the header?
          // Or, if the header parser skipped non-time tokens, our index map is packed.
          // We need to sync them.

          // Let's refine the sync:
          // The provided data implies positional alignment.
          // Header: Start t1 t2 t3 t4 t5 - Lunch t6 ...
          // Row:    ...   c1 c2 c3 c4 c5 - Lunch c6 ...
          // So if we iterate tokens and tokens match "Lunch" or "-", we should probably skip an index IF the header had one there?
          // But wait, `theoryStart` only has entries for actual times.
          // So if token[k] is "Lunch", we shouldn't try to look up `theoryStart[timeColIndex]` if that index implies the k-th valuable column.

          // Let's rely on the fact that `isTimeToken` filtered the header.
          // So we have N start times.
          // The data row has M tokens.
          // We need to ignore tokens that are clearly not classes (like Lunch, -) AND likely correspond to gaps.

          // Heuristic: Just increment timeColIndex ONLY when we process a potential class slot?
          // No, "empty slot" (dash) is a slot. "Lunch" is a slot (break).
          // If the data row has a dash "-", it corresponds to a time slot that is free.
          // So we SHOULD increment timeColIndex for "-".
          // But "Lunch"?
          // Header has: 08:00 ... 12:00 - Lunch 14:00
          // Data has:   Cell  ... Cell  - Lunch Cell
          // So "-" aligns with "-"? NO, Header said 12:00 then "-". 
          // Actually looking at raw data:
          // HEORY Start 08:00 ... 12:00 - Lunch 14:00
          // 12:00 is index 4. "-" is index 5. "Lunch" is index 6.
          // `theoryStart` (filtered) has indices 0,1,2,3,4(for 12:00), 5(for 14:00).
          // `theoryStart` does NOT have entries for "-" or "Lunch".

          // So when iterating data row tokens:
          // Token 0 (Cell) -> timeIdx 0
          // ...
          // Token 4 (Cell) -> timeIdx 4
          // Token 5 ("-") -> Not a time slot? Or is it?
          // Token 6 ("Lunch") -> Not a time slot.
          // Token 7 (Cell) -> timeIdx 5

          // Strategy: Increment `timeColIndex` ONLY if the current token is NOT 'Lunch' and NOT '-'?
          // Wait, if I have a free period "-", it consumes a time slot!
          // BUT "Lunch" is a break, usually not a class slot.
          // And the header "-" might differ from data "-".

          // Let's look at the header again: "12:00 - Lunch 14:00"
          // 12:00 is a slot. "-" follows it. Lunch follows that.
          // In data: "TG1 - Lunch A2"
          // TG1 corresponds to 12:00?
          // If so:
          // TG1 -> 12:00 (timeIdx 4)
          // -   -> ?
          // Lunch -> ?
          // A2  -> 14:00 (timeIdx 5)

          // So we need to skip tokens that don't map to a time index.
          // We can check if `item` matches the ignored patterns.

          if (item === '-' || item.toUpperCase() === 'LUNCH') {
            // Do not increment `timeColIndex`?
            // If "-" represents a free slot at 13:00, we WOULD want to increment if we had a time for it.
            // But `theoryStart` has NO time for it.
            // So yes, do NOT increment.
            return;
          }

          // If not skipped, we treat it as occupying `theoryStart[timeColIndex]`
          // and THEN increment.
          timeColIndex++;
        });
      }

      // Look ahead for LAB row
      // It might be on the same line (rare) or next line.
      // In provided data:
      // MON THEORY ...
      // LAB ...
      // The LAB row starts with "LAB", not "MON LAB".
      // Use the next line i+1.
    }

    if (firstToken === 'LAB') {
      // We need to know which DAY this belongs to.
      // We can track the `lastSeenDay`.
    }
  }

  // Revised Pass 2 with state for Day
  let currentDay: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const tokens = tokenize(lines[i]);
    if (tokens.length === 0) continue;
    const firstToken = tokens[0].toUpperCase();

    if (DAY_REGEX.test(firstToken)) {
      currentDay = firstToken;
    }

    if (currentDay && (firstToken.includes('EORY') || (tokens[1] && tokens[1].toUpperCase().includes('EORY')))) {
      // Theory Row
      // Tokens might be ["MON", "THEORY", ...] or just ["THEORY", ...] if implicit?
      // In provided data: "MON THEORY ..."
      const startIndex = tokens[1]?.toUpperCase().includes('EORY') ? 2 : 1;
      // If firstToken was DAY, then tokens[1] is THEORY. Start at 2.

      const items = tokens.slice(startIndex);
      let timeIdx = 0;

      items.forEach(item => {
        if (item === '-' || item.toUpperCase() === 'LUNCH') return;

        const start = theoryStart[timeIdx];
        const end = theoryEnd[timeIdx];

        if (start && end) {
          const match = item.match(CELL_REGEX);
          if (match) {
            results.push({
              day: currentDay!,
              startTime: start,
              endTime: end,
              courseCode: match[2],
              classType: 'Theory',
              location: match[4]
            });
          }
        }
        timeIdx++;
      });
    }

    if (currentDay && firstToken === 'LAB') {
      // Lab Row
      // Tokens: ["LAB", "L1", "L2"...]
      const items = tokens.slice(1);
      let timeIdx = 0;

      items.forEach(item => {
        if (item === '-' || item.toUpperCase() === 'LUNCH') return;

        const start = labStart[timeIdx];
        const end = labEnd[timeIdx];

        if (start && end) {
          const match = item.match(CELL_REGEX);
          if (match) {
            results.push({
              day: currentDay!,
              startTime: start,
              endTime: end,
              courseCode: match[2],
              classType: 'Lab',
              location: match[4]
            });
          }
        }
        timeIdx++;
      });

      // After processing Lab, we are done with this day? 
      // Usually yes, format is Day Theory / Lab.
      // currentDay remains set until next Day line.
    }
  }

  return results;
}
