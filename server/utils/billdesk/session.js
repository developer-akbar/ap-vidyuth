export function generateDynamicCookie(requestCookie, setCookieHeaders) {
  if (!setCookieHeaders || setCookieHeaders.length === 0) return requestCookie || '';

  let newCookie = requestCookie || '';

  // 1. Extract Values
  let newJSessionId = null;
  let newTsValues = {};

  for (const header of setCookieHeaders) {
    // Parse key-value from the header before the first semicolon
    const firstPart = header.split(';')[0].trim();
    const match = firstPart.match(/^([^=]+)=(.+)$/);
    if (match) {
      const key = match[1];
      const value = match[2];
      if (key === 'JSESSIONID') {
        newJSessionId = value;
      } else if (key.startsWith('TS') || key === 'srv_id' || key.startsWith('BIGipServer')) {
        newTsValues[key] = value;
      }
    }
  }

  // If no original cookie, construct from scratch
  if (!newCookie) {
    let parts = [];
    for (const [k, v] of Object.entries(newTsValues)) parts.push(`${k}=${v}`);
    if (newJSessionId) parts.push(`JSESSIONID=${newJSessionId}`);
    return parts.join('; ');
  }

  // 2. Replace JSESSIONID
  if (newJSessionId) {
    if (/JSESSIONID=[^;]+/.test(newCookie)) {
      newCookie = newCookie.replace(/JSESSIONID=[^;]+/, `JSESSIONID=${newJSessionId}`);
    } else {
      newCookie += (newCookie ? '; ' : '') + `JSESSIONID=${newJSessionId}`;
    }
  }

  // 3. Replace Next TS Cookie
  // In the original Request Cookie string, identify the specific TS... key that immediately follows JSESSIONID.
  const jsessionMatch = newCookie.match(/JSESSIONID=[^;]+(?:;\s*(TS[^=]+)=([^;]+))?/);
  if (jsessionMatch && jsessionMatch[1]) {
    const nextTsKey = jsessionMatch[1];
    
    let replacementValue = null;
    
    // Replace its value with the matching TS... value from the response Set-Cookie headers
    // 1st priority: Match by the exact same TS key
    if (newTsValues[nextTsKey]) {
      replacementValue = newTsValues[nextTsKey];
    } else {
      // 2nd priority: Fallback to the 4th Set-Cookie header (often the TS key rotates or is mapped)
      if (setCookieHeaders.length >= 4) {
        const fourthHeader = setCookieHeaders[3].split(';')[0].trim();
        const fourthMatch = fourthHeader.match(/^TS[^=]+=(.+)$/);
        if (fourthMatch) {
          replacementValue = fourthMatch[1];
        }
      }
    }

    if (replacementValue) {
      newCookie = newCookie.replace(new RegExp(`${nextTsKey}=[^;]+`), `${nextTsKey}=${replacementValue}`);
    }
  }

  return newCookie;
}

export async function scrapeBillDeskSession(requestCookie) {
  const BILLDESK_URL = 'https://payments.billdesk.com/MercOnline/SPDCLController';
  const headers = {
    'User-Agent': 'Mozilla/5.0',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  };
  if (requestCookie) {
    headers.Cookie = requestCookie;
  }

  const res = await fetch(BILLDESK_URL, { headers });
  if (!res.ok) {
    throw new Error(`Failed to scrape BillDesk session, status: ${res.status}`);
  }

  const html = await res.text();

  // Parse reqtoken
  const tokenMatch = html.match(/name="reqtoken"\s+value="([^"]+)"/i) || html.match(/reqtoken\s*=\s*["']([^"']+)["']/i);
  const reqtoken = tokenMatch ? tokenMatch[1] : null;

  // Parse Set-Cookie
  let setCookieHeaders = [];
  // fetch API handles getSetCookie() for multiple Set-Cookie headers in Node 18+
  if (res.headers.getSetCookie) {
    setCookieHeaders = res.headers.getSetCookie();
  } else {
    // Fallback if running on older node without getSetCookie
    const rawSetCookie = res.headers.get('set-cookie');
    if (rawSetCookie) {
      // Very naive split, usually separated by commas, but getSetCookie is standard now
      setCookieHeaders = rawSetCookie.split(', ').map(c => c.trim());
    }
  }

  const newCookie = generateDynamicCookie(requestCookie, setCookieHeaders);

  return {
    reqtoken,
    cookie: newCookie,
  };
}
