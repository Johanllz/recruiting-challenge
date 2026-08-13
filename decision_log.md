# Decision Log — Juan Lopez Lopez


## Authorship declaration

I wrote this entire decision log by myself without any AI correction tool or spell check, neither AI polish fix or aid. These are my own words. The only help I used was Claude ONLY to understan how the code works. 

---

## Issues addressed

- **Issue 1 — Date range filter ignored**
  - What was wrong or weak: The filter on the listByMerchant query was only applied if both filters were used (FROM and TO)
  - Shape of my improvement: Both filters/conditions are now independant from each other, instead of requiring both.
  - **Confidence (1–10): 6**
  - **What would falsify this fix** (a specific scenario, input, or behavior that would prove me wrong): Sending a wrong date does't break the dashboard, only returns am empty or wrong result. 
  - **I disagreed with Claude on: Did not disagree with claude during the fix, seemed like a real fix for this issue in the moment, after deeping with claude into the fix then I understood this was a an easy fix with some vulnerabilities** 
  - Alternatives I considered and rejected: Rejecting dates before certain year, for example before 1900 (non existant).

- **Issue 2 — merchant_id**
  - What was wrong or weak: There was no verification to the merchant_id before, would't verify if it was actually in the database 
  - Shape of my improvement: A query was added to the merchants table before continuing to verify the merchant exists, in case it doesn't returns a 401 error.
  - **Confidence (1–10): 4 **
  - **What would falsify this fix: Sending a non existant merchant_id and getting something different from the 401 would imply this fix is weak and not the best approach. **
  - **I disagreed with Claude on: I accepted it as it was, withnthe time I had I could't think of any other solution. **
  - Alternatives I considered and rejected: There was no alternative, it was the obvious and easiest fix.

- **Issue 3 — Revenue/Refunds**
  - What was wrong or weak: SumAmoundByMerchant added the total amounts without verifying the type, a refound would add instead of decrease.
  - Shape of my improvement:I excluded refunds out of the total revenues, 
  - **Confidence (1–10):**
  - **What would falsify this fix:**
  - **I disagreed with Claude on:**
  - Alternatives I considered and rejected:

## Feature chosen

- **Feature:**
- **Why this one and not the others:**
- **What I cut to ship it in budget:**
- **Confidence (1–10) that the shape I picked is the right one:**
- **What would change my mind:**

## Things I noticed but did NOT fix

-The security gap in the merchant_id, anybody could return the data from the dashboard, and the fixes me and claude implemented did't fix the security validation, only if the id was there.

## Docs / code I left alone deliberately

-Most docs and scripts were unmodified, only a few src files, and docs/api.md were modified and wrote by claude.

## What I'd do with another 6 hours

-Use other AI like Deepseek or Codex as a second or third auditor to verify the whole project like I did with Gemini and CLaude. 
-Run longer tests and add more improvements to the dashboard like UI.
-Better fixes for the security gaps found (for example the merchant id security gap).
-Try to fix the secondary issues found by claude and Gemini.


## Where I felt uncertain


-My knowledge in web development is limited, my main focus is not web or app development, I understand the logic or most parts of what claude fixed in the code, but I had to read a lot and it took a lot of the time I had to complete this assignment.
-The fixes claude proposed and applied; I understood in general what he did, but if I had to explain exactly what would happen if some lines in the code were changed I will find it difficult to tell. Also finding other solutions, I felt very limited in this area.
-The implementation of the Feature A,  asked Claude how to implement the feature and what will he change, but I couldn't implement it because it took a lot of my time to understand deeply what will be changed. 
-The validation design too, In that artifact I felt I lack the knowledge or experience to offer a better or more detailed answer, I could not answer it sincerely.

## Timing note
I started working around 7pm saturday (I had a medical appointment), worked until ~3am and then slept, and resumed at 10am today (sunday). I'm sending this past the 24-hour window, most of the extra time went into web development research, trying to understand better what was being fixed, and also enviroment setup.