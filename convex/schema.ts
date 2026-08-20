import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

// default user roles. can add / remove based on the project as needed
export const ROLES = {
  ADMIN: "admin",
  USER: "user",
  MEMBER: "member",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
  v.literal(ROLES.MEMBER),
);
export type Role = Infer<typeof roleValidator>;

const schema = defineSchema(
  {
    // users table
    users: defineTable({
      name: v.optional(v.string()), // name of the user
      image: v.optional(v.string()), // image of the user
      email: v.optional(v.string()), // email of the user
      emailVerificationTime: v.optional(v.number()), // email verification time
      isAnonymous: v.optional(v.boolean()), // is the user anonymous
      role: v.optional(roleValidator), // role of the user
    }).index("email", ["email"]), // index for the email

    // ignoreRules table
    ignoreRules: defineTable({
      userId: v.string(),
      scope: v.union(
        v.literal("location"),
        v.literal("report"),
        v.literal("account"),
        v.literal("global"),
      ),
      fingerprint: v.string(),
      accountHash: v.optional(v.string()),
      reportHash: v.optional(v.string()),
      locationHash: v.optional(v.string()),
      docType: v.string(),
      differenceType: v.string(),
      comparisonMode: v.string(),
      createdAt: v.number(),
    }).index("by_user", ["userId"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
