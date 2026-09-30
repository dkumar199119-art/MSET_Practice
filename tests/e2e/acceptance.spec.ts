/**
 * Spec §60 final acceptance scenario, executed through the real UI against a
 * real PostgreSQL database (every role logs in and performs its own step).
 */
import { expect, test, type Page } from "@playwright/test";
import * as XLSX from "xlsx";

const PW = "Password@123";

async function login(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PW);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/(dashboard|student)/, { timeout: 30_000 });
}

async function saved(page: Page, text: string | RegExp) {
  await expect(page.getByRole("status").filter({ hasText: text }).first()).toBeVisible();
}

test("MVP acceptance: HOD → PC → CC → Faculty → Students → Reviews → Locked → IQAC reports", async ({ page }) => {
  // ---------------- HOD creates program and assigns the Program Coordinator
  await login(page, "hod.me@obe.local");
  await page.goto("/programs");
  await page.getByLabel("Program code").fill("BTECH-ME");
  await page.getByLabel("Program name").fill("B.Tech Mechanical Engineering");
  await page.getByRole("button", { name: "Create program" }).click();
  await saved(page, "Program created");
  await page.getByRole("row", { name: /BTECH-ME/ }).getByRole("link", { name: "Open" }).click();
  await expect(page.getByText("Program Outcomes (12)")).toBeVisible();
  await page.getByLabel("Assign Program Coordinator").selectOption({ label: "Dr. Kavita Joshi (ME)" });
  await page.getByRole("button", { name: "Assign Program Coordinator" }).click();
  await saved(page, "Program Coordinator assigned");
  const programUrl = page.url();

  // ---------------- Program Coordinator: PSOs, course ME301, Course Coordinator
  await login(page, "pc.me@obe.local");
  await page.goto(programUrl);
  for (const [title, desc] of [["Mechanical design & analysis", "Design and analyse mechanical components using mechanics principles."], ["Thermal & manufacturing", "Apply thermal and manufacturing sciences to industrial problems."]]) {
    await page.getByPlaceholder("PSO title").fill(title);
    await page.getByPlaceholder("Description").last().fill(desc);
    await page.getByRole("button", { name: "Add PSO" }).click();
    await expect(page.getByText(title)).toBeVisible();
  }
  await page.getByLabel("Course code").fill("ME301");
  await page.getByLabel("Course name").fill("Engineering Mechanics");
  await page.getByRole("button", { name: "Create course" }).click();
  await saved(page, "Course created");
  await page.getByRole("row", { name: /ME301/ }).getByRole("link").click();
  await page.getByLabel("Assign Course Coordinator").selectOption({ label: "Prof. Nikhil Patil (ME)" });
  await page.getByRole("button", { name: "Assign Course Coordinator" }).click();
  await saved(page, "Course Coordinator assigned");
  const courseUrl = page.url();

  // ---------------- Course Coordinator allocates ME301 to Faculty A
  await login(page, "cc.me@obe.local");
  await page.goto(courseUrl);
  await page.getByRole("combobox", { name: /^Faculty/ }).selectOption({ label: "Prof. Ananya Rao (Faculty A) (ME)" });
  await page.getByRole("button", { name: "Allocate Faculty" }).click();
  await saved(page, /Faculty allocated/);

  // ---------------- Faculty A sees the course at 0% and completes the setup wizard
  await login(page, "faculty.a@obe.local");
  await expect(page.getByRole("heading", { name: "My Assigned Courses" })).toBeVisible();
  await expect(page.getByText("Engineering Mechanics")).toBeVisible();
  await expect(page.getByText("0%").first()).toBeVisible();
  await page.getByRole("link", { name: /Start Course Setup/ }).click();
  await expect(page.getByText("Course Setup Completion")).toBeVisible();
  const ws = page.url().replace(/\/$/, "");
  const offeringId = ws.split("/").pop()!;
  const step = (s: string) => page.goto(`${ws}/${s}`);

  await step("profile");
  await page.getByRole("button", { name: "Confirm course profile" }).click();
  await expect(page.getByText(/Confirmed/)).toBeVisible();

  await step("syllabus");
  await page.getByLabel("Unit 1 title").fill("Statics and equilibrium");
  await page.getByLabel("Unit 1 topics").fill("Force systems, free-body diagrams, equilibrium of rigid bodies");
  await page.getByRole("button", { name: "Add unit" }).click();
  await page.getByLabel("Unit 2 title").fill("Dynamics of particles");
  await page.getByLabel("Unit 2 topics").fill("Kinematics, work-energy, impulse-momentum");
  await page.getByRole("button", { name: "Save syllabus" }).click();
  await saved(page, "Syllabus saved");

  await step("objectives");
  await page.getByRole("button", { name: "Add objective" }).click();
  await page.getByLabel("Objective 1").fill("Introduce the principles of statics and equilibrium.");
  await page.getByRole("button", { name: "Add objective" }).click();
  await page.getByLabel("Objective 2").fill("Develop the ability to analyse particle dynamics.");
  await page.getByRole("button", { name: "Save objectives" }).click();
  await saved(page, "Course objectives saved");

  const cos = [
    ["Apply principles of statics to determine resultants of coplanar force systems.", "APPLY"],
    ["Analyze plane trusses to determine member forces using joints and sections.", "ANALYZE"],
    ["Compute centroids and moments of inertia of composite plane areas.", "APPLY"],
    ["Solve kinematic problems of particles in rectilinear and curvilinear motion.", "APPLY"],
    ["Evaluate dynamic systems using work-energy and impulse-momentum principles.", "EVALUATE"],
  ];
  await step("outcomes");
  for (let i = 0; i < cos.length; i++) {
    await page.getByRole("button", { name: "Add CO" }).click();
    await page.getByLabel(`CO${i + 1} statement`).fill(cos[i][0]);
  }
  await expect(page.getByText(/Measurable — action verb/).first()).toBeVisible();
  await page.getByRole("button", { name: "Save course outcomes" }).click();
  await saved(page, "Course outcomes saved");

  await step("bloom");
  for (let i = 0; i < cos.length; i++) await page.getByLabel(`CO${i + 1} Bloom level`).selectOption(cos[i][1]);
  await page.getByRole("button", { name: "Save Bloom levels" }).click();
  await saved(page, "Bloom levels saved");

  await step("targets");
  await page.getByLabel("Course target (%)").fill("60");
  await page.getByRole("button", { name: "Save targets" }).click();
  await saved(page, "CO targets saved");

  await step("co-po");
  for (let i = 1; i <= 5; i++) {
    await page.getByLabel(`CO${i} to PO1`, { exact: true }).selectOption("3");
    await page.getByLabel(`CO${i} to PO2`, { exact: true }).selectOption("2");
  }
  await expect(page.getByText("CO mapping coverage").locator("..").getByText("100%")).toBeVisible();
  await page.getByRole("button", { name: "Save CO-PO matrix" }).click();
  await saved(page, "CO-PO matrix saved");

  await step("co-pso");
  await page.getByLabel("CO1 to PSO1", { exact: true }).selectOption("2");
  await page.getByLabel("CO2 to PSO1", { exact: true }).selectOption("3");
  await page.getByRole("button", { name: "Save CO-PSO matrix" }).click();
  await saved(page, "CO-PSO matrix saved");

  await step("assessments");
  await page.getByRole("button", { name: "Add assessment" }).click();
  await page.getByLabel("Assessment name").fill("Mid Term");
  await page.getByLabel("Maximum marks").fill("50");
  await page.getByLabel("Weightage (%)").fill("100");
  for (let k = 0; k < 4; k++) await page.getByRole("button", { name: "Add question" }).click();
  const maxInputs = page.getByLabel("Question max marks");
  for (let k = 0; k < 5; k++) {
    await maxInputs.nth(k).fill("10");
    await page.getByLabel(`Q${k + 1} maps to CO${k + 1}`).check();
  }
  await expect(page.getByText("Questions total 50 / 50")).toBeVisible();
  await page.getByRole("button", { name: "Save assessment structure" }).click();
  await saved(page, "Assessment structure saved");

  await step("question-mapping");
  await expect(page.getByRole("button", { name: "Mid Term Q3 → CO3" })).toHaveAttribute("aria-pressed", "true");

  await step("students");
  await page.getByRole("button", { name: /Enroll Batch/ }).click();
  await saved(page, "12 student(s) enrolled");

  // Marks: download the pre-filled template, fill it, upload, validate, confirm
  await step("marks");
  const tpl = await page.request.get(`/api/marks-template/${offeringId}`);
  expect(tpl.status()).toBe(200);
  const wb = XLSX.read(await tpl.body(), { type: "buffer" });
  const aoa = XLSX.utils.sheet_to_json<(string | number)[]>(wb.Sheets[wb.SheetNames[0]], { header: 1 });
  expect(aoa.length).toBe(1 + 12 * 5);
  aoa.slice(1).forEach((r, i) => { r[4] = 6 + (i % 5); });
  const out = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(out, XLSX.utils.aoa_to_sheet(aoa), "Marks");
  const buf = XLSX.write(out, { type: "buffer", bookType: "xlsx" }) as Buffer;

  // first an invalid file is rejected
  const bad = aoa.map((r) => [...r]);
  bad[1][4] = 99;
  const badWb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(badWb, XLSX.utils.aoa_to_sheet(bad), "Marks");
  await page.locator('input[type="file"]').setInputFiles({ name: "bad.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: XLSX.write(badWb, { type: "buffer", bookType: "xlsx" }) as Buffer });
  await page.getByRole("button", { name: "Validate" }).click();
  await expect(page.getByText(/exceed maximum 10/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm & save" })).toBeDisabled();

  await page.locator('input[type="file"]').setInputFiles({ name: "ME301_marks.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: buf });
  await page.getByRole("button", { name: "Validate" }).click();
  await expect(page.getByText("All records valid")).toBeVisible();
  await page.getByRole("button", { name: "Confirm & save" }).click();
  await saved(page, "60 marks saved");

  await step("direct");
  await page.getByRole("button", { name: "Calculate attainment" }).click();
  await saved(page, /recalculated/);
  await expect(page.getByRole("row", { name: /CO1/ }).first()).toContainText("12");

  await step("feedback");
  await page.getByRole("button", { name: /Generate & publish feedback form/ }).click();
  await saved(page, "Feedback form published");

  // ---------------- Students submit course feedback
  for (const roll of ["me23001", "me23002", "me23003", "me23004"]) {
    await login(page, `${roll}@students.obe.local`);
    await page.goto("/student");
    await page.getByRole("link", { name: "Give feedback" }).click();
    const groups = page.locator("fieldset");
    await expect(groups).toHaveCount(5);
    for (let i = 0; i < 5; i++) await groups.nth(i).locator("label").filter({ hasText: "4" }).click();
    await page.getByRole("button", { name: "Submit feedback" }).click();
    await expect(page.getByText("Feedback can be submitted only once")).toBeVisible();
  }
  // duplicate submission is not possible
  await page.goto(`/student/feedback/${offeringId}`);
  await expect(page.getByText("Feedback submitted").first()).toBeVisible();

  // ---------------- Faculty recalculates, reviews gaps, adds evidence, submits
  await login(page, "faculty.a@obe.local");
  await page.goto(`${ws}/attainment`);
  await page.getByRole("button", { name: "Recalculate" }).click();
  await saved(page, /recalculated/);
  await expect(page.getByText(/Final = Direct × 0.80 \+ Indirect × 0.20/).first()).toBeAttached();
  await page.goto(`${ws}/indirect`);
  await expect(page.getByRole("row", { name: /CO1/ })).toContainText("80.00%");
  await page.goto(`${ws}/contribution`);
  await expect(page.getByRole("row", { name: /PO1 Engineering knowledge/ })).toContainText("%");

  await page.goto(`${ws}/gaps`);
  await page.getByRole("button", { name: "Explain gaps & suggest actions" }).click();
  await expect(page.getByText(/Gemini is not configured/)).toBeVisible();
  const required = page.getByRole("cell", { name: "required" });
  const need = await required.count();
  for (let i = 0; i < need; i++) {
    await page.getByLabel("Root cause").fill("Insufficient problem-solving practice in this outcome area");
    await page.getByLabel("Corrective action").fill("Weekly tutorials and a targeted assignment in the next offering");
    const opts = await page.getByRole("combobox", { name: /^Gap/ }).locator("option").allTextContents();
    const target = opts.find((o) => /below target|critical/.test(o) && !o.includes("✓"));
    if (target) await page.getByRole("combobox", { name: /^Gap/ }).selectOption({ label: target });
    await page.getByRole("button", { name: "Add action plan" }).click();
    await saved(page, "Action plan recorded");
  }

  await page.goto(`${ws}/evidence`);
  await page.getByLabel("Title").fill("Mid Term question paper");
  await page.locator('input[name="file"]').setInputFiles({ name: "midterm.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 question paper") });
  await page.getByRole("button", { name: "Upload" }).click();
  await saved(page, "Evidence uploaded");

  await page.goto(ws);
  await expect(page.getByText("100%").first()).toBeVisible();
  await page.goto(`${ws}/submission`);
  await page.getByRole("button", { name: "Submit Course for Review" }).click();
  await saved(page, "Course submitted for review");

  // ---------------- Reviews: Course Coordinator → Program Coordinator → HOD
  for (const reviewer of ["cc.me@obe.local", "pc.me@obe.local", "hod.me@obe.local"]) {
    await login(page, reviewer);
    await page.goto("/reviews");
    await page.getByRole("row", { name: /ME301/ }).getByRole("link", { name: "Review" }).click();
    await page.getByRole("button", { name: "Approve" }).click();
    await saved(page, "Approved");
  }
  await expect(page.getByText("Approved · Locked").first()).toBeVisible();
  await expect(page.getByText("2025-26 Version 1")).toBeVisible();

  // locked for faculty
  await login(page, "faculty.a@obe.local");
  await page.goto(`${ws}/outcomes`);
  await expect(page.getByText(/Academic data is read-only/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Save course outcomes" })).toHaveCount(0);

  // ---------------- Program attainment (PC) and IQAC visibility + reports
  await login(page, "pc.me@obe.local");
  await page.goto(programUrl.replace("/programs/", "/attainment/"));
  await page.getByRole("button", { name: "Calculate program attainment" }).click();
  await saved(page, "Program attainment recalculated");
  await expect(page.getByRole("row", { name: /PO1 Engineering knowledge/ })).toContainText("ME301");

  await login(page, "iqac@obe.local");
  await page.goto("/iqac");
  const row = page.getByRole("row", { name: /ME301/ });
  await expect(row).toContainText("100%");
  await expect(row).toContainText("Approved · Locked");
  for (const fmt of ["PDF", "XLSX", "CSV"]) {
    for (const t of ["COURSE_ATTAINMENT", "COURSE_PO_PSO", "COURSE_GAP"]) {
      const r = await page.request.get(`/api/reports?type=${t}&format=${fmt}&offeringId=${offeringId}`);
      expect(r.status(), `${t} ${fmt}`).toBe(200);
      if (fmt === "PDF") expect((await r.body()).subarray(0, 4).toString()).toBe("%PDF");
    }
  }
  await page.goto("/reports");
  const progLink = page.getByRole("row", { name: /BTECH-ME.*2025-26/ }).getByRole("link", { name: "PDF" }).first();
  const href = await progLink.getAttribute("href");
  const pr = await page.request.get(href!);
  expect(pr.status()).toBe(200);
  expect((await pr.body()).subarray(0, 4).toString()).toBe("%PDF");
  const gap = await page.request.get(href!.replace("PROGRAM_ATTAINMENT", "PROGRAM_GAP").replace("PDF", "XLSX"));
  expect(gap.status()).toBe(200);
});
