import assert from "node:assert/strict";
import test from "node:test";
import { goldCoastCourses } from "./course-catalog.ts";

test("course presets have unique, complete and analytically valid scorecards", () => {
  assert.equal(new Set(goldCoastCourses.map((course) => course.id)).size, goldCoastCourses.length);
  assert.ok(goldCoastCourses.length > 0);

  for (const course of goldCoastCourses) {
    assert.ok(course.name.trim());
    assert.ok([9, 18].includes(course.pars.length), `${course.id} must have 9 or 18 holes`);
    assert.ok(course.pars.every((par) => par >= 3 && par <= 6), `${course.id} has an invalid par`);
    if (course.distancesMetres) {
      assert.equal(course.distancesMetres.length, course.pars.length);
      assert.ok(course.distancesMetres.every((distance) => distance === undefined || distance > 0));
    }
  }
});
