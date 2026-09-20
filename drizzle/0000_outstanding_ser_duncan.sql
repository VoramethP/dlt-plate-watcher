CREATE TABLE "events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_id" text,
	"actor_name" text,
	"kind" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "meta" (
	"k" text PRIMARY KEY NOT NULL,
	"v" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meta" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "notified" (
	"key" text PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notified" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "wishlist" (
	"number" integer PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"owner_id" text NOT NULL,
	"owner_name" text NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wishlist" ENABLE ROW LEVEL SECURITY;