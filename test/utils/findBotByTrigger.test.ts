import { advancedOperatorsSearch } from "../../src/utils/advancedOperatorsSearch";
import { findBotByTrigger } from "../../src/utils/findBotByTrigger";

// Mocks to isolate the function logic
jest.mock("../../src/utils/advancedOperatorsSearch");

describe("findBotByTrigger", () => {
	type BotRepositoryMock = {
		findFirst: jest.Mock;
		findMany: jest.Mock;
	};

	let botRepository: BotRepositoryMock;

	beforeEach(() => {
		jest.clearAllMocks();
		// Creating a fake Prisma Repository (Stub)
		botRepository = {
			findFirst: jest.fn(),
			findMany: jest.fn(),
		};
	});

	it("should return bot if triggerType is all or none", async () => {
		const mockBot = { id: 1, triggerType: "all" };
		// Mocks the very first db query to return our bot
		botRepository.findFirst.mockResolvedValueOnce(mockBot);

		const result = await findBotByTrigger(
			botRepository,
			"hello world",
			"inst-123",
		);

		expect(result).toBe(mockBot);
		// Verifies if the DB query was structured correctly
		expect(botRepository.findFirst).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({
					triggerType: { in: ["all", "none"] },
				}),
			}),
		);
	});

	it("should return bot if advanced search matches", async () => {
		botRepository.findFirst.mockResolvedValueOnce(null); // 'all/none' returns null

		const mockBot = {
			id: 2,
			triggerType: "advanced",
			triggerValue: "advanced-val",
		};
		botRepository.findMany.mockResolvedValueOnce([mockBot]); // 'advanced' query returns an array

		// Mocks the internal helper function to return true
		(advancedOperatorsSearch as jest.Mock).mockReturnValue(true);

		const result = await findBotByTrigger(botRepository, "hello", "inst-123");

		expect(result).toBe(mockBot);
		expect(advancedOperatorsSearch).toHaveBeenCalledWith(
			"hello",
			"advanced-val",
		);
	});

	it("should return bot if exact match (equals)", async () => {
		botRepository.findFirst.mockResolvedValueOnce(null); // all/none
		botRepository.findMany.mockResolvedValueOnce([]); // advanced loop bypass

		const mockBot = { id: 3, triggerOperator: "equals" };
		botRepository.findFirst.mockResolvedValueOnce(mockBot); // equals query returns bot

		const result = await findBotByTrigger(
			botRepository,
			"exact keyword",
			"inst-123",
		);
		expect(result).toBe(mockBot);
	});

	it("should return bot if regex matches", async () => {
		botRepository.findFirst.mockResolvedValueOnce(null); // all/none
		botRepository.findMany.mockResolvedValueOnce([]); // advanced
		botRepository.findFirst.mockResolvedValueOnce(null); // equals

		const mockBot = { id: 4, triggerOperator: "regex", triggerValue: "^he.*" };
		botRepository.findMany.mockResolvedValueOnce([mockBot]); // regex query

		const result = await findBotByTrigger(
			botRepository,
			"hello there",
			"inst-123",
		);
		expect(result).toBe(mockBot);
	});

	it("should skip regex bot if pattern does not match", async () => {
		botRepository.findFirst.mockResolvedValueOnce(null); // all/none
		botRepository.findMany.mockResolvedValueOnce([]); // advanced
		botRepository.findFirst.mockResolvedValueOnce(null); // equals

		const mockBot = { id: 4, triggerOperator: "regex", triggerValue: "^bye.*" };
		botRepository.findMany.mockResolvedValueOnce([mockBot]); // regex query

		// We expect it to continue down the file, we mock the rest as empty to safely reach the end
		botRepository.findMany.mockResolvedValue([]);

		const result = await findBotByTrigger(
			botRepository,
			"hello there",
			"inst-123",
		);
		expect(result).toBeNull();
	});

	it("should return bot if startsWith matches", async () => {
		botRepository.findFirst.mockResolvedValueOnce(null); // all/none
		botRepository.findMany.mockResolvedValueOnce([]); // advanced
		botRepository.findFirst.mockResolvedValueOnce(null); // equals
		botRepository.findMany.mockResolvedValueOnce([]); // regex

		const mockBot = {
			id: 5,
			triggerOperator: "startsWith",
			triggerValue: "hey",
		};
		botRepository.findMany.mockResolvedValueOnce([mockBot]); // startsWith query

		const result = await findBotByTrigger(
			botRepository,
			"hey buddy",
			"inst-123",
		);
		expect(result).toBe(mockBot);
	});

	it("should return bot if endsWith matches", async () => {
		botRepository.findFirst.mockResolvedValue(null);
		botRepository.findMany
			.mockResolvedValueOnce([]) // advanced
			.mockResolvedValueOnce([]) // regex
			.mockResolvedValueOnce([]) // startsWith
			.mockResolvedValueOnce([
				{ id: 6, triggerOperator: "endsWith", triggerValue: "world" },
			]);

		const result = await findBotByTrigger(
			botRepository,
			"hello world",
			"inst-123",
		);

		expect(result).toEqual({
			id: 6,
			triggerOperator: "endsWith",
			triggerValue: "world",
		});
	});

	it("should return bot if contains matches", async () => {
		botRepository.findFirst.mockResolvedValue(null);
		botRepository.findMany
			.mockResolvedValueOnce([]) // advanced
			.mockResolvedValueOnce([]) // regex
			.mockResolvedValueOnce([]) // startsWith
			.mockResolvedValueOnce([]) // endsWith
			.mockResolvedValueOnce([
				{ id: 7, triggerOperator: "contains", triggerValue: "lo wo" },
			]);

		const result = await findBotByTrigger(
			botRepository,
			"hello world",
			"inst-123",
		);

		expect(result).toEqual({
			id: 7,
			triggerOperator: "contains",
			triggerValue: "lo wo",
		});
	});

	it("should scope every repository query to the requested instance", async () => {
		botRepository.findFirst.mockResolvedValue(null);
		botRepository.findMany.mockResolvedValue([]);

		await findBotByTrigger(botRepository, "hello", "tenant-a");

		const queries = [
			...botRepository.findFirst.mock.calls,
			...botRepository.findMany.mock.calls,
		];
		expect(queries).not.toHaveLength(0);
		for (const [query] of queries) {
			expect(query.where.instanceId).toBe("tenant-a");
		}
	});

	it("should return null if absolutely nothing matches", async () => {
		botRepository.findFirst.mockResolvedValue(null);
		botRepository.findMany.mockResolvedValue([]);

		const result = await findBotByTrigger(
			botRepository,
			"random text",
			"inst-123",
		);
		expect(result).toBeNull();
	});
});
