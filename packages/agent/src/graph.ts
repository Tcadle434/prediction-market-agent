/**
 * The forecast loop as a compiled LangGraph `StateGraph`.
 *
 * Wiring is a straight line for v1:
 *   START → gatherNews → forecast → size → approvalGate → execute → log → END
 *
 * `new StateGraph(AgentState)` binds the graph to our typed state (so `addNode`/`addEdge` know the
 * channels and node names); `.compile()` validates the wiring — every referenced node exists, the
 * graph is reachable from START — and returns something runnable with `.invoke()` / `.stream()`.
 *
 * The nodes are stubs today; they fill in over P2 steps 3–7. Compiling the whole graph first means
 * we can run the entire belt end to end and watch state flow before any node does real work.
 *
 * LangGraph gotcha: a node id may not collide with a state channel name. `forecast` is a channel
 * (`state.forecast`), so the forecast node is registered under the id `makeForecast`.
 */
import { END, START, StateGraph } from "@langchain/langgraph";
import type { AgentDeps } from "./deps.js";
import {
	approvalGate,
	createForecastNode,
	createGatherNewsNode,
	createSizeNode,
	execute,
	log,
} from "./nodes/index.js";
import { AgentState } from "./state.js";

/** Build and compile the forecast-loop graph. Pass `deps` to inject fakes (e.g. a test model). */
export function buildForecastGraph(deps: AgentDeps = {}) {
	return new StateGraph(AgentState)
		.addNode("gatherNews", createGatherNewsNode(deps.gatherNews))
		.addNode("makeForecast", createForecastNode(deps.forecast))
		.addNode("size", createSizeNode(deps.size))
		.addNode("approvalGate", approvalGate)
		.addNode("execute", execute)
		.addNode("log", log)
		.addEdge(START, "gatherNews")
		.addEdge("gatherNews", "makeForecast")
		.addEdge("makeForecast", "size")
		.addEdge("size", "approvalGate")
		.addEdge("approvalGate", "execute")
		.addEdge("execute", "log")
		.addEdge("log", END)
		.compile();
}
