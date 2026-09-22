/**
 * Role and Job Details Extraction Service
 * Deterministically extracts role title, seniority, responsibilities, and location from a Job Description.
 */

export interface ExtractedRoleDetails {
  title: string;
  seniority: string;
  responsibilities: string[];
  location: string;
}

export function extractRoleDetails(jobDescription: string): ExtractedRoleDetails {
  const lines = jobDescription.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);

  // 1. Extract Role Title
  let title = "Software Engineer";
  for (const line of lines.slice(0, 10)) {
    const titleMatch = line.match(/(?:title|role|position):\s*(.+)/i);
    if (titleMatch) {
      title = titleMatch[1].trim();
      break;
    }
    // Check if the line looks like a job title heading (e.g. "Senior Backend Engineer", "Full Stack Developer")
    if (
      /^(?:senior|junior|lead|staff|principal|associate|entry-level)?\s*[a-z0-9/\s-]+\s+(?:engineer|developer|architect|specialist|scientist|analyst|manager|lead)/i.test(
        line
      ) &&
      line.length <= 80 &&
      !line.includes(":")
    ) {
      title = line.replace(/^#+\s*/, "").trim();
      break;
    }
  }

  // 2. Infer Seniority
  let seniority = "Mid";
  const titleAndJD = `${title} ${jobDescription.slice(0, 1500)}`.toLowerCase();
  if (/\b(?:principal|director|head of)\b/.test(titleAndJD)) {
    seniority = "Principal";
  } else if (/\b(?:staff)\b/.test(titleAndJD)) {
    seniority = "Staff";
  } else if (/\b(?:lead|tech lead)\b/.test(titleAndJD)) {
    seniority = "Lead";
  } else if (/\b(?:senior|sr\.?|5\+\s*years|7\+\s*years|8\+\s*years)\b/.test(titleAndJD)) {
    seniority = "Senior";
  } else if (/\b(?:junior|jr\.?|associate|entry-level|intern|internship|graduate)\b/.test(titleAndJD)) {
    seniority = "Entry";
  }

  // 3. Extract Responsibilities
  const responsibilities: string[] = [];
  let inResponsibilitiesSection = false;

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (
      lower.includes("responsibilities") ||
      lower.includes("what you will do") ||
      lower.includes("what you'll do") ||
      lower.includes("your role") ||
      lower.includes("day to day") ||
      lower.includes("key duties")
    ) {
      inResponsibilitiesSection = true;
      continue;
    }

    if (
      inResponsibilitiesSection &&
      (lower.includes("requirements") ||
        lower.includes("qualifications") ||
        lower.includes("skills") ||
        lower.includes("benefits") ||
        lower.includes("about you"))
    ) {
      inResponsibilitiesSection = false;
      continue;
    }

    if (inResponsibilitiesSection) {
      const bulletMatch = line.match(/^[-*•\d.)\]]\s*(.+)$/);
      if (bulletMatch) {
        const item = bulletMatch[1].trim();
        if (item.length > 5) {
          responsibilities.push(item);
        }
      }
    }
  }

  // Fallback responsibilities if not explicitly bulleted under a responsibilities header
  if (responsibilities.length === 0) {
    for (const line of lines) {
      const bulletMatch = line.match(/^[-*•]\s*(.+)$/);
      if (bulletMatch) {
        const item = bulletMatch[1].trim();
        if (
          item.length > 10 &&
          !item.toLowerCase().includes("bachelor") &&
          !item.toLowerCase().includes("years of experience")
        ) {
          responsibilities.push(item);
          if (responsibilities.length >= 4) break;
        }
      }
    }
  }

  if (responsibilities.length === 0) {
    responsibilities.push(`Design, develop, and maintain high quality software as a ${title}.`);
  }

  // 4. Extract Location
  let location = "Not specified";
  for (const line of lines.slice(0, 15)) {
    const locMatch = line.match(/(?:location|work location|workplace):\s*(.+)/i);
    if (locMatch) {
      location = locMatch[1].trim();
      break;
    }
    if (/\b(?:remote|hybrid|on-site|onsite)\b/i.test(line) && line.length <= 60) {
      location = line.replace(/^#+\s*/, "").trim();
      break;
    }
  }

  return {
    title,
    seniority,
    responsibilities,
    location,
  };
}
