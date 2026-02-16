export type ParsedClass = {
  day: string;
  startTime: string;
  endTime: string;
  courseCode: string;
  classType: 'Theory' | 'Lab';
  location?: string;
};

const COURSE_CODE_REGEX = /\b([A-Z]{2,}[0-9]{3,})\b/;
// Support 24h (08:00, 9:00, 19:50) and 12h with AM/PM (8:00 AM, 12:30PM)
const TIME_TOKEN_REGEX = /^((?:[01]?[0-9]|2[0-3]):[0-5][0-9])\s*(?:AM|PM)?$/i;
const DAY_REGEX = /^(MON|TUE|WED|THU|FRI|SAT|SUN)$/i;

function tokenize(line: string): string[] {
  // Normalize tabs and multiple spaces into a single space, then split.
  return line
    .replace(/[\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .split(' ');
}

function isTimeToken(token: string) {
  return TIME_TOKEN_REGEX.test(token);
}

function containsCourseCode(text: string) {
  return COURSE_CODE_REGEX.test(text);
}

function isRealClassCell(cell: string) {
  // Must contain a hyphen and a course code like CBS1009, MGT1064, etc.
  return cell.includes('-') && containsCourseCode(cell);
}

function extractCourseCode(text: string): string | undefined {
  const m = text.match(COURSE_CODE_REGEX);
  return m ? m[1] : undefined;
}

function extractLocation(parts: string[]): string | undefined {
  // Heuristic: choose the last non-empty token that isn't a course code
  for (let i = parts.length - 1; i >= 0; i--) {
    const token = parts[i].trim();
    if (!token) continue;
    if (COURSE_CODE_REGEX.test(token)) continue;
    if (/^[A-Za-z0-9\-\s]+$/.test(token) && token.toLowerCase() !== 'tbd') {
      return token;
    }
  }
  return undefined;
}

// Note: Single extractLocation implementation retained above to avoid duplicate declarations.

export function parseTimetable(rawText: string): ParsedClass[] {
  const lines = rawText
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0);

  // Time maps by column index for Theory and Lab
  const theoryStart: Record<number, string> = {};
  const theoryEnd: Record<number, string> = {};
  const labStart: Record<number, string> = {};
  const labEnd: Record<number, string> = {};

  let section: 'THEORY' | 'LAB' | null = null;

  // First pass: build column -> time maps using header rows
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const tokens = tokenize(raw);
    if (tokens.length === 0) continue;

    const isTheoryToken = (tok: string) => tok && tok.toUpperCase().includes('EORY'); // tolerate 'HEORY'
    if ((isTheoryToken(tokens[0]) || tokens[0].toUpperCase() === 'LAB') && tokens[1] && tokens[1].toUpperCase() === 'START') {
      section = tokens[0].toUpperCase() as 'THEORY' | 'LAB';
      // tokens: [THEORY, START, t0, t1, ...]
      const startTimes = tokens.slice(2).filter(isTimeToken);
      startTimes.forEach((t, idx) => {
        if (section === 'THEORY') theoryStart[idx] = t;
        else labStart[idx] = t;
      });
      continue;
    }

    if (tokens[0].toUpperCase() === 'END' && section) {
      // tokens: [END, t0, t1, ...]
      const endTimes = tokens.slice(1).filter(isTimeToken);
      endTimes.forEach((t, idx) => {
        if (section === 'THEORY') theoryEnd[idx] = t;
        else labEnd[idx] = t;
      });
      // do not reset section yet; next headers will change it as needed
      continue;
    }

    // Multi-line headers handling: separate lines for section, Start/End, then one time per line
    if (isTheoryToken(tokens[0])) { section = 'THEORY'; continue; }
    if (tokens[0].toUpperCase() === 'LAB') { section = 'LAB'; continue; }

    if (tokens[0].toUpperCase() === 'START' && section) {
      const times: string[] = [];
      let j = i + 1;
      while (j < lines.length) {
        const candidate = lines[j].trim();
        if (candidate.length === 0) { j++; continue; }
        if (/^END$/i.test(candidate)) break; // end of block
        if (/^(LUNCH|-)$/.test(candidate)) { j++; continue; } // skip lunch/placeholder
        if (isTimeToken(candidate)) { times.push(candidate); j++; continue; }
        // stop on headers or day tokens
        if (/^(THEORY|LAB|MON|TUE|WED|THU|FRI|SAT|SUN)$/i.test(candidate)) break;
        break;
      }
      times.forEach((t, idx) => {
        if (section === 'THEORY') theoryStart[idx] = t;
        else labStart[idx] = t;
      });
      i = j - 1; // advance
      continue;
    }

    if (tokens[0].toUpperCase() === 'END' && section) {
      const times: string[] = [];
      let j = i + 1;
      while (j < lines.length) {
        const candidate = lines[j].trim();
        if (candidate.length === 0) { j++; continue; }
        if (/^(START|THEORY|LAB|MON|TUE|WED|THU|FRI|SAT|SUN)$/i.test(candidate)) break; // next block/header
        if (/^(LUNCH|-)$/.test(candidate)) { j++; continue; }
        if (isTimeToken(candidate)) { times.push(candidate); j++; continue; }
        break;
      }
      times.forEach((t, idx) => {
        if (section === 'THEORY') theoryEnd[idx] = t;
        else labEnd[idx] = t;
      });
      i = j - 1;
      continue;
    }
  }

  // Second pass: parse days
  const results: ParsedClass[] = [];
  for (let i = 0; i < lines.length; i++) {
    const tokens = tokenize(lines[i]);
    if (tokens.length === 0) continue;

    // Expect a day line like: MON THEORY <cells...>
    const dayToken = tokens[0].toUpperCase();
    if (!DAY_REGEX.test(dayToken)) continue;

    // THEORY row for the day
    const theoryRow = tokens;
    if (theoryRow[1] && theoryRow[1].toUpperCase() === 'THEORY') {
      const cells = theoryRow.slice(2);
      let timeIdx = 0;
      cells.forEach((cell) => {
        if (!cell) return;
        if (cell === '-' || cell.toLowerCase() === 'lunch') return; // placeholders were removed from time maps
        const startTime = theoryStart[timeIdx];
        const endTime = theoryEnd[timeIdx];
        if (isRealClassCell(cell)) {
          const parts = cell.split('-');
          const courseCode = extractCourseCode(cell);
          const location = extractLocation(parts);
          if (courseCode && startTime && endTime) {
            results.push({
              day: dayToken,
              startTime,
              endTime,
              courseCode,
              classType: 'Theory',
              location,
            });
          }
        }
        // advance time index for any non-placeholder cell (even if not a real class)
        timeIdx++;
      });
    }

    // LAB row may be the next line starting with LAB or DAY LAB
    const nextIdx = i + 1;
    if (nextIdx < lines.length) {
      const nextTokens = tokenize(lines[nextIdx]);
      let labCellsStart = -1;
      let labDay = dayToken;
      if (nextTokens[0] && nextTokens[0].toUpperCase() === 'LAB') {
        labCellsStart = 1; // LAB <cells...>
      } else if (nextTokens[0] && DAY_REGEX.test(nextTokens[0].toUpperCase()) && nextTokens[1] && nextTokens[1].toUpperCase() === 'LAB') {
        labCellsStart = 2; // MON LAB <cells...>
        labDay = nextTokens[0].toUpperCase();
      }
      if (labCellsStart !== -1) {
        const cells = nextTokens.slice(labCellsStart);
        let timeIdx = 0;
        cells.forEach((cell) => {
          if (!cell) return;
          if (cell === '-' || cell.toLowerCase() === 'lunch') return;
          const startTime = labStart[timeIdx];
          const endTime = labEnd[timeIdx];
          if (isRealClassCell(cell)) {
            const parts = cell.split('-');
            const courseCode = extractCourseCode(cell);
            const location = extractLocation(parts);
            if (courseCode && startTime && endTime) {
              results.push({
                day: labDay,
                startTime,
                endTime,
                courseCode,
                classType: 'Lab',
                location,
              });
            }
          }
          timeIdx++;
        });
        // skip ahead since we handled the lab row
        i = nextIdx;
      }
    }
  }

  return results;
}
