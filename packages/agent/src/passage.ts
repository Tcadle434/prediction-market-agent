import { RetrievedChunkSchema } from "@lykos/core";
import { z } from "zod";

/**
 * A retrieved chunk enriched with its source attribution (url + title).
 *
 * `retrieve()` returns bare RetrievedChunks — the vector store doesn't keep the source url. But
 * grounding a forecast in citations means pointing back to the article, so `gatherNews` joins each
 * chunk to the Evidence it came from and carries url + title forward on this passage. This is the
 * element type of the `news` state channel, and what the forecast node cites against.
 */
export const RetrievedPassageSchema = RetrievedChunkSchema.extend({
	url: z.string().url(),
	title: z.string(),
});
export type RetrievedPassage = z.infer<typeof RetrievedPassageSchema>;
