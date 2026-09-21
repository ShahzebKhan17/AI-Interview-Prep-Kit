import mongoose, { Document, Schema, Model, Types } from "mongoose";
import {
  KitStatus,
  RequirementPriority,
  RequirementKind,
  QuestionCategory,
  ContentState,
} from "../../shared/types";

export interface IRequirementDoc {
  id: string;
  kitId?: Types.ObjectId | string;
  text: string;
  kind: RequirementKind;
  priority: RequirementPriority;
}

export interface ISourceDoc {
  url: string;
  title: string;
  sourceType: string;
}

export interface ICompanyBriefDoc {
  summary: string;
  productsOrServices: string[];
  industry: string;
  hiringProcess: string | null;
  sources: ISourceDoc[];
}

export interface IRoleBreakdownDoc {
  summary: string;
  responsibilities: string[];
  skills: string[];
}

export interface IQuestionDoc {
  id: string;
  category: QuestionCategory;
  question: string;
  answerOutline: string;
  requirementIds: string[];
  durationMinutes: number;
  state: ContentState;
}

export interface IFlashcardDoc {
  id: string;
  front: string;
  back: string;
  state: ContentState;
}

export interface IStudyDayDoc {
  day: number;
  topic: string;
  questionIds: string[];
  durationMinutes: number;
}

export interface IKitDoc {
  userId: Types.ObjectId;
  title: string;
  jobDescription: string;
  companyUrl: string;
  daysAvailable: number;
  status: KitStatus;
  requirements: IRequirementDoc[];
  companyBrief: ICompanyBriefDoc;
  roleBreakdown: IRoleBreakdownDoc;
  questionBank: IQuestionDoc[];
  flashcards: IFlashcardDoc[];
  studySchedule: IStudyDayDoc[];
  createdAt: Date;
  updatedAt: Date;
}

export type KitDocument = Document & IKitDoc;

const requirementSchema = new Schema<IRequirementDoc>(
  {
    id: { type: String, required: true },
    kitId: { type: Schema.Types.ObjectId, ref: "Kit" },
    text: { type: String, required: true, trim: true },
    kind: {
      type: String,
      enum: ["technical", "behavioral", "domain"],
      required: true,
      default: "technical",
    },
    priority: { type: String, enum: ["must", "nice"], required: true },
  },
  { _id: false }
);

const sourceSchema = new Schema<ISourceDoc>(
  {
    url: { type: String, required: true },
    title: { type: String, required: true },
    sourceType: { type: String, required: true },
  },
  { _id: false }
);

const companyBriefSchema = new Schema<ICompanyBriefDoc>(
  {
    summary: { type: String, default: "" },
    productsOrServices: { type: [String], default: [] },
    industry: { type: String, default: "" },
    hiringProcess: { type: String, default: null },
    sources: { type: [sourceSchema], default: [] },
  },
  { _id: false }
);

const roleBreakdownSchema = new Schema<IRoleBreakdownDoc>(
  {
    summary: { type: String, default: "" },
    responsibilities: { type: [String], default: [] },
    skills: { type: [String], default: [] },
  },
  { _id: false }
);

const questionSchema = new Schema<IQuestionDoc>(
  {
    id: { type: String, required: true },
    category: {
      type: String,
      enum: ["technical", "behavioral", "company", "roleSpecific"],
      required: true,
    },
    question: { type: String, required: true, trim: true },
    answerOutline: { type: String, default: "" },
    requirementIds: { type: [String], default: [] },
    durationMinutes: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isInteger,
        message: "durationMinutes must be an integer",
      },
    },
    state: {
      type: String,
      enum: ["generated", "edited", "pinned"],
      default: "generated",
    },
  },
  { _id: false }
);

const flashcardSchema = new Schema<IFlashcardDoc>(
  {
    id: { type: String, required: true },
    front: { type: String, required: true, trim: true },
    back: { type: String, required: true, trim: true },
    state: {
      type: String,
      enum: ["generated", "edited", "pinned"],
      default: "generated",
    },
  },
  { _id: false }
);

const studyDaySchema = new Schema<IStudyDayDoc>(
  {
    day: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isInteger,
        message: "day must be an integer",
      },
    },
    topic: { type: String, required: true, trim: true },
    questionIds: { type: [String], default: [] },
    durationMinutes: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isInteger,
        message: "durationMinutes must be an integer",
      },
    },
  },
  { _id: false }
);

const kitSchema = new Schema<KitDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true },
    jobDescription: { type: String, required: true },
    companyUrl: { type: String, required: true, trim: true },
    daysAvailable: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isInteger,
        message: "daysAvailable must be an integer",
      },
    },
    status: {
      type: String,
      enum: ["draft", "generating", "ready", "failed", "partial"],
      default: "draft",
    },
    requirements: {
      type: [requirementSchema],
      default: [],
      validate: [
        {
          validator: function (reqs: IRequirementDoc[]) {
            const seen = new Set<string>();
            for (const r of reqs) {
              const upper = r.id.toUpperCase();
              if (seen.has(upper)) return false;
              seen.add(upper);
            }
            return true;
          },
          message: "All requirements within a kit must have unique IDs.",
        },
      ],
    },
    companyBrief: {
      type: companyBriefSchema,
      default: () => ({
        summary: "",
        productsOrServices: [],
        industry: "",
        hiringProcess: null,
        sources: [],
      }),
    },
    roleBreakdown: {
      type: roleBreakdownSchema,
      default: () => ({
        summary: "",
        responsibilities: [],
        skills: [],
      }),
    },
    questionBank: { type: [questionSchema], default: [] },
    flashcards: { type: [flashcardSchema], default: [] },
    studySchedule: { type: [studyDaySchema], default: [] },
  },
  {
    timestamps: true,
  }
);

kitSchema.index({ userId: 1, createdAt: -1 });
kitSchema.index({ "requirements.id": 1 });

export const Kit: Model<KitDocument> =
  mongoose.models.Kit || mongoose.model<KitDocument>("Kit", kitSchema);
