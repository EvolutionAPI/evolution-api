import { configService } from "../../src/config/env.config";
import { getConversationMessage } from "../../src/utils/getConversationMessage";

jest.mock("../../src/config/env.config", () => ({
	configService: {
		get: jest.fn(),
	},
}));

describe("getConversationMessage", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		(configService.get as jest.Mock).mockReturnValue({
			ENABLE: false,
			SAVE_VIDEO: false,
		});
	});

	it("should extract text from a basic conversation message", () => {
		const msg = { message: { conversation: "Hello World" } };
		expect(getConversationMessage(msg)).toBe("Hello World");
	});

	it("should extract text from an extended text message", () => {
		const msg = { message: { extendedTextMessage: { text: "Extended Text" } } };
		expect(getConversationMessage(msg)).toBe("Extended Text");
	});

	it("should extract displayName from a contact message", () => {
		const msg = { message: { contactMessage: { displayName: "John Doe" } } };
		expect(getConversationMessage(msg)).toBe("John Doe");
	});

	it("should format an image message using message ID when S3 is disabled", () => {
		const msg = {
			key: { id: "MSG123" },
			message: { imageMessage: { caption: "Beautiful picture" } },
		};
		expect(getConversationMessage(msg)).toBe(
			"imageMessage|MSG123|Beautiful picture",
		);
	});

	it("should format a video message using mediaUrl when S3 is enabled and SAVE_VIDEO is true", () => {
		(configService.get as jest.Mock).mockReturnValue({
			ENABLE: true,
			SAVE_VIDEO: true,
		});

		const msg = {
			key: { id: "MSG123" },
			message: {
				mediaUrl: "https://s3.aws.com/video.mp4",
				videoMessage: { caption: "Funny video" },
			},
		};
		expect(getConversationMessage(msg)).toBe(
			"videoMessage|https://s3.aws.com/video.mp4|Funny video",
		);
	});

	it("should handle externalAdReply body and append it to the message", () => {
		const msg = {
			message: { conversation: "Check out this ad" },
			contextInfo: { externalAdReply: { body: "Ad Content Here" } },
		};
		expect(getConversationMessage(msg)).toBe(
			"Check out this ad\nexternalAdReplyBody|Ad Content Here",
		);
	});

	it("should handle externalAdReply body when it is the only content", () => {
		const msg = {
			contextInfo: { externalAdReply: { body: "Only Ad Content" } },
		};
		expect(getConversationMessage(msg)).toBe(
			"externalAdReplyBody|Only Ad Content",
		);
	});

	it("should return 'unknown' when message format is unknown", () => {
		const msg = { message: { unknownFormat: "???" } };
		expect(getConversationMessage(msg)).toBe("unknown");
	});
});
