import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const generateForProject = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    // Check freeze
    const freezes = await ctx.db
      .query("freezeRecords")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();
    if (freezes.length === 0) {
      throw new Error("MOD version must be frozen before generating automation.");
    }

    const testCases = await ctx.db
      .query("testCases")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();

    const approved = testCases.filter((tc) => tc.status !== "BLOCKED");
    if (approved.length === 0) {
      throw new Error("No test cases found. Generate manual test cases first.");
    }

    const project = await ctx.db.get(args.projectId);
    const projectName = project?.name?.replace(/[^a-zA-Z0-9]/g, "") || "Test";

    // Generate a Java test class for each test case
    const testClasses: Array<{
      testcaseId: string;
      className: string;
      javaCode: string;
    }> = [];

    for (const tc of approved) {
      const className = `${projectName}${tc.testcaseId.replace(/-/g, "")}Test`;
      const javaCode = generateJavaTest(tc, className);
      testClasses.push({ testcaseId: tc.testcaseId, className, javaCode });
    }

    // Store the automation results as a JSON string in the analysis result of a synthetic entry
    // For now, return the generated code so the frontend can display/download it
    return {
      generated: testClasses.length,
      testClasses,
      fullSuite: generateTestSuite(testClasses, projectName),
    };
  },
});

export const listGenerated = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const testCases = await ctx.db
      .query("testCases")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();

    const project = await ctx.db.get(args.projectId);
    const projectName = project?.name?.replace(/[^a-zA-Z0-9]/g, "") || "Test";

    return testCases
      .filter((tc) => tc.status !== "BLOCKED")
      .map((tc) => {
        const className = `${projectName}${tc.testcaseId.replace(/-/g, "")}Test`;
        return {
          testcaseId: tc.testcaseId,
          className,
          javaCode: generateJavaTest(tc, className),
        };
      });
  },
});

// --- Java code generation helpers ---

interface TestCase {
  testcaseId: string;
  requirement: string;
  precondition: string;
  description: string;
  testData: string;
  steps: string;
  expectedResult: string;
  status: string;
  ruleIds: string[];
}

function generateJavaTest(tc: TestCase, className: string): string {
  const steps = tc.steps
    .split("\n")
    .filter((s) => s.trim())
    .map((s, i) => `        // Step ${i + 1}: ${s.trim()}\n        // TODO: Implement step`)
    .join("\n\n");

  return `package com.modernization.test;

import org.junit.jupiter.api.*;
import org.junit.jupiter.api.MethodOrderer.OrderAnnotation;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.chrome.ChromeDriver;
import org.openqa.selenium.By;
import org.openqa.selenium.support.ui.WebDriverWait;
import org.openqa.selenium.support.ui.ExpectedConditions;
import java.time.Duration;
import static org.junit.jupiter.api.Assertions.*;

/**
 * Automated test case: ${tc.testcaseId}
 * Requirement: ${tc.requirement}
 * Description: ${tc.description}
 * Precondition: ${tc.precondition}
 *
 * TRACEABILITY:
 *   Requirement → ${tc.requirement}
 *   Test Case   → ${tc.testcaseId}
 *   Rules       → ${tc.ruleIds.join(", ") || "none"}
 *
 * IMPORTANT: This test does NOT contain real credentials.
 * Configure test data via environment variables or test properties.
 */
@TestMethodOrder(OrderAnnotation.class)
public class ${className} {

    private static WebDriver driver;
    private static WebDriverWait wait;

    @BeforeAll
    static void setupClass() {
        // TODO: Configure driver path or use WebDriverManager
        driver = new ChromeDriver();
        wait = new WebDriverWait(driver, Duration.ofSeconds(30));
        driver.manage().window().maximize();
    }

    @AfterAll
    static void teardownClass() {
        if (driver != null) {
            driver.quit();
        }
    }

    @Test
    @Order(1)
    @DisplayName("${tc.testcaseId}: ${tc.description.replace(/"/g, '\\"')}")
    void test${tc.testcaseId.replace(/-/g, "")}() {
        // Precondition: ${tc.precondition}
        // Test Data: ${tc.testData}

        // Arrange
        // TODO: Set up test data and navigate to the target page

        // Act
${steps || "        // TODO: Implement test steps"}

        // Assert
        // TODO: Verify expected result
        // Expected: ${tc.expectedResult}
        // assertEquals(expected, actual, "Verify ${tc.testcaseId} behavior");
    }
}`;
}

function generateTestSuite(
  testClasses: Array<{ testcaseId: string; className: string }>,
  projectName: string,
): string {
  const imports = testClasses
    .map((tc) => `import com.modernization.test.${tc.className};`)
    .join("\n");

  const tests = testClasses
    .map(
      (tc) => `    @Test
    @Order(1)
    @DisplayName("Run ${tc.testcaseId}")
    void run${tc.testcaseId.replace(/-/g, "")}() {
        new ${tc.className}().test${tc.testcaseId.replace(/-/g, "")}();
    }`,
    )
    .join("\n\n");

  return `package com.modernization.test;

import org.junit.jupiter.api.*;
${imports}

/**
 * Master test suite for ${projectName} modernization.
 * Runs all generated test cases in order.
 *
 * Generated by MIPTE — Modernization Intelligence Platform.
 * Do NOT manually edit — regenerate from the platform.
 */
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
public class ${projectName}TestSuite {

${tests}
}`;
}
