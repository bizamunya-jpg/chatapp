package com.subspring.chatapp.backend;

import java.time.LocalDateTime;
import java.time.Instant;
import java.util.UUID;

import com.subspring.chatapp.backend.entities.Room;
import com.subspring.chatapp.backend.entities.Message;
import com.subspring.chatapp.backend.repositories.MessageRepository;
import com.subspring.chatapp.backend.repositories.ConversationParticipantRepository;
import com.subspring.chatapp.backend.repositories.RoomRepository;
import com.subspring.chatapp.backend.repositories.UserRepository;
import com.subspring.chatapp.backend.entities.ConversationParticipant;
import com.subspring.chatapp.backend.entities.ConversationParticipantId;
import com.subspring.chatapp.backend.entities.User;
import com.subspring.chatapp.backend.services.RoomService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.data.domain.PageRequest;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.http.MediaType;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;

@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:chatapp;DB_CLOSE_DELAY=-1",
        "spring.datasource.username=sa",
        "app.jwt.secret=test-secret-that-is-long-enough-for-hs256",
        "app.files.storage-root=./target/test-uploads",
        "spring.datasource.password=",
        "spring.jpa.hibernate.ddl-auto=create-drop"
})
@AutoConfigureMockMvc
class BackendApplicationTests {

	@Autowired
	private RoomRepository roomRepository;

	@Autowired
	private MessageRepository messageRepository;

	@Autowired
	private ConversationParticipantRepository participantRepository;

	@Autowired
	private UserRepository userRepository;

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JsonMapper jsonMapper;

	@Test
	void contextLoads() {
	}

	@Test
	void repositoriesPersistPrismaConversationAndMessageRecords() {
		Room room = new Room();
		room.setTitle("Room by ID or title");
		Room savedRoom = roomRepository.saveAndFlush(room);
		String roomId = savedRoom.getId();

		Message message = new Message();
		message.setContent("Hello");
		message.setCreatedAt(LocalDateTime.now());
		message.setConversationId(roomId);
		message.setSenderId("test-user");
		messageRepository.saveAndFlush(message);

		assertNotNull(roomRepository.findById(roomId).orElse(null));
		assertEquals(
				"Hello",
				messageRepository.findByConversationIdOrderByCreatedAtDesc(
						roomId,
						PageRequest.of(0, 20)
				).getContent().get(0).getContent()
		);

		Jwt jwt = createUserAndJwt();
		participantRepository.saveAndFlush(participant(roomId, jwt.getSubject()));
		assertEquals(roomId, roomRepository.findById(roomId).orElseThrow().getId());
		assertEquals(true, participantRepository.existsByIdConversationIdAndIdUserId(roomId, jwt.getSubject()));
		assertEquals(1, messageRepository.findByConversationIdOrderByCreatedAtDesc(
				roomId,
				PageRequest.of(0, 20)
		).getContent().size());
	}

	@Test
	void createGroupConversationStoresNameAndGeneratesDifferentUniqueIds() throws Exception {
		Jwt jwt = createUserAndJwt();
		RoomService roomService = new RoomService(roomRepository, participantRepository);
		Room firstRoom = roomService.createRoom("First room", jwt.getSubject());
		Room secondRoom = roomService.createRoom("Second room", jwt.getSubject());
		UUID firstId = UUID.fromString(firstRoom.getId());
		UUID secondId = UUID.fromString(secondRoom.getId());

		assertNotNull(roomRepository.findById(firstId.toString()).orElse(null));
		assertNotNull(roomRepository.findById(secondId.toString()).orElse(null));
		assertNotEquals(firstId, secondId);
		assertEquals("First room", firstRoom.getTitle());
		assertEquals("Second room", secondRoom.getTitle());
		assertEquals("First room", roomRepository.findById(firstId.toString()).orElseThrow().getTitle());
		assertEquals("Second room", roomRepository.findById(secondId.toString()).orElseThrow().getTitle());
		assertEquals(true, participantRepository.existsByIdConversationIdAndIdUserId(
				firstRoom.getId(),
				jwt.getSubject()
		));
	}

	@Test
	void roomsCanBeDiscoveredRequestedApprovedAndJoinedByInvitation() throws Exception {
		JsonNode owner = registerAccount("roomowner");
		JsonNode requester = registerAccount("roomrequester");
		JsonNode invitee = registerAccount("roominvitee");
		String ownerToken = owner.get("accessToken").asText();
		String requesterToken = requester.get("accessToken").asText();
		String inviteeToken = invitee.get("accessToken").asText();

		String response = mockMvc.perform(post("/api/v1/room")
						.header("Authorization", "Bearer " + ownerToken)
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"roomname":"API-created room"}
								"""))
				.andExpect(status().isCreated())
				.andReturn().getResponse().getContentAsString();

		JsonNode room = jsonMapper.readTree(response);
		assertEquals("API-created room", room.get("title").asText());
		String roomId = room.get("id").asText();
		assertEquals(true, participantRepository.existsByIdConversationIdAndIdUserId(
				roomId,
				owner.get("user").get("id").asText()
		));
		assertEquals(
				com.subspring.chatapp.backend.entities.RoomRole.ADMIN,
				participantRepository.findById(new ConversationParticipantId(
						roomId,
						owner.get("user").get("id").asText()
				)).orElseThrow().getRole()
		);

		mockMvc.perform(get("/api/v1/rooms")
						.header("Authorization", "Bearer " + requesterToken))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$[0].id").value(roomId))
				.andExpect(jsonPath("$[0].roomname").value("API-created room"));

		String joinRequestResponse = mockMvc.perform(post("/api/v1/rooms/{roomId}/join-requests", roomId)
						.header("Authorization", "Bearer " + requesterToken))
				.andExpect(status().isCreated())
				.andReturn().getResponse().getContentAsString();
		JsonNode joinRequest = jsonMapper.readTree(joinRequestResponse);
		String joinRequestId = joinRequest.get("id").asText();
		mockMvc.perform(post("/api/v1/rooms/{roomId}/join-requests", roomId)
						.header("Authorization", "Bearer " + requesterToken))
				.andExpect(status().isConflict());
		mockMvc.perform(get("/api/v1/conversations/{conversationId}/messages", roomId)
						.header("Authorization", "Bearer " + requesterToken))
				.andExpect(status().isForbidden());

		mockMvc.perform(patch("/api/v1/room/{roomId}/join-requests/{requestId}", roomId, joinRequestId)
						.header("Authorization", "Bearer " + ownerToken)
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"approved":true}
								"""))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.status").value("APPROVED"));
		assertEquals(
				com.subspring.chatapp.backend.entities.RoomRole.PARTICIPANT,
				participantRepository.findById(new ConversationParticipantId(
						roomId,
						requester.get("user").get("id").asText()
				)).orElseThrow().getRole()
		);
		mockMvc.perform(get("/api/v1/conversations/{conversationId}/messages", roomId)
						.header("Authorization", "Bearer " + requesterToken))
				.andExpect(status().isOk());

		String participantListResponse = mockMvc.perform(get("/api/v1/room/{roomId}/participants", roomId)
						.header("Authorization", "Bearer " + ownerToken))
				.andExpect(status().isOk())
				.andReturn().getResponse().getContentAsString();
		JsonNode listedParticipants = jsonMapper.readTree(participantListResponse);
		assertTrue(containsParticipantRole(listedParticipants, owner.get("user").get("id").asText(), "ADMIN"));
		assertTrue(containsParticipantRole(listedParticipants, requester.get("user").get("id").asText(), "PARTICIPANT"));
		mockMvc.perform(post("/api/v1/room/{roomId}/invitations", roomId)
						.header("Authorization", "Bearer " + requesterToken)
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"userId":"%s"}
								""".formatted(invitee.get("user").get("id").asText())))
				.andExpect(status().isForbidden());
		mockMvc.perform(patch(
						"/api/v1/room/{roomId}/participants/{userId}/role",
						roomId,
						requester.get("user").get("id").asText()
				)
						.header("Authorization", "Bearer " + ownerToken)
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"role":"ADMIN"}
								"""))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.role").value("ADMIN"));

		String invitationResponse = mockMvc.perform(post("/api/v1/room/{roomId}/invitations", roomId)
						.header("Authorization", "Bearer " + requesterToken)
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"userId":"%s"}
								""".formatted(invitee.get("user").get("id").asText())))
				.andExpect(status().isCreated())
				.andReturn().getResponse().getContentAsString();
		String invitationId = jsonMapper.readTree(invitationResponse).get("id").asText();
		mockMvc.perform(get("/api/v1/room/invitations")
						.header("Authorization", "Bearer " + inviteeToken))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$[0].id").value(invitationId));
		mockMvc.perform(get("/api/v1/conversations/{conversationId}/messages", roomId)
						.header("Authorization", "Bearer " + inviteeToken))
				.andExpect(status().isForbidden());
		mockMvc.perform(patch("/api/v1/room/invitations/{invitationId}", invitationId)
						.header("Authorization", "Bearer " + inviteeToken)
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"accepted":true}
								"""))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.status").value("ACCEPTED"));
		mockMvc.perform(get("/api/v1/conversations/{conversationId}/messages", roomId)
						.header("Authorization", "Bearer " + inviteeToken))
				.andExpect(status().isOk());

		mockMvc.perform(post("/api/v1/rooms")
						.header("Authorization", "Bearer " + ownerToken)
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"roomname":"Plural is listing only"}
								"""))
				.andExpect(status().isMethodNotAllowed());
	}

	@Test
	void onlyRoomAdminsCanDeleteRooms() throws Exception {
		JsonNode owner = registerAccount("deleteroomowner");
		JsonNode member = registerAccount("deleteroommember");
		String ownerToken = owner.get("accessToken").asText();
		String memberToken = member.get("accessToken").asText();

		String roomResponse = mockMvc.perform(post("/api/v1/room")
						.header("Authorization", "Bearer " + ownerToken)
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"roomname":"Room for deletion test"}
								"""))
				.andExpect(status().isCreated())
				.andReturn().getResponse().getContentAsString();
		String roomId = jsonMapper.readTree(roomResponse).get("id").asText();

		String invitationResponse = mockMvc.perform(post("/api/v1/room/{roomId}/invitations", roomId)
						.header("Authorization", "Bearer " + ownerToken)
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"userId":"%s"}
								""".formatted(member.get("user").get("id").asText())))
				.andExpect(status().isCreated())
				.andReturn().getResponse().getContentAsString();
		String invitationId = jsonMapper.readTree(invitationResponse).get("id").asText();
		mockMvc.perform(patch("/api/v1/room/invitations/{invitationId}", invitationId)
						.header("Authorization", "Bearer " + memberToken)
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"accepted":true}
								"""))
				.andExpect(status().isOk());

		mockMvc.perform(delete("/api/v1/room/{roomId}", roomId)
						.header("Authorization", "Bearer " + memberToken))
				.andExpect(status().isForbidden());
		mockMvc.perform(delete("/api/v1/room/{roomId}", roomId)
						.header("Authorization", "Bearer " + ownerToken))
				.andExpect(status().isNoContent());
		assertFalse(roomRepository.existsById(roomId));
	}

	@Test
	void registrationLoginRefreshAndProtectedProfileWork() throws Exception {
		String username = "auth" + UUID.randomUUID().toString().replace("-", "").substring(0, 10);
		String email = username + "@example.test";
		String registrationBody = """
				{"username":"%s","email":"%s","password":"Pass123!","displayName":"Test User"}
				""".formatted(username, email);

		mockMvc.perform(post("/api/v1/auth/register")
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"username":"%s","email":"%s","password":"Pass12!"}
								""".formatted(username, email)))
				.andExpect(status().isBadRequest());

		Instant registrationStartedAt = Instant.now();
		String registration = mockMvc.perform(post("/api/v1/auth/register")
						.contentType(MediaType.APPLICATION_JSON)
						.content(registrationBody))
				.andExpect(status().isCreated())
				.andReturn().getResponse().getContentAsString();
		Instant registrationCompletedAt = Instant.now();
		JsonNode registered = jsonMapper.readTree(registration);
		String accessToken = registered.get("accessToken").asText();
		String refreshToken = registered.get("refreshToken").asText();
		Instant accessTokenExpiresAt = Instant.parse(registered.get("accessTokenExpiresAt").asText());
		assertTrue(accessTokenExpiresAt.isAfter(registrationStartedAt.plusSeconds(3 * 60 * 60)));
		assertTrue(accessTokenExpiresAt.isBefore(registrationCompletedAt.plusSeconds(3 * 60 * 60)));

		mockMvc.perform(get("/api/v1/users/me"))
				.andExpect(status().isUnauthorized());
		mockMvc.perform(get("/api/v1/users/me").header("Authorization", "Bearer " + accessToken))
				.andExpect(status().isOk());
		mockMvc.perform(post("/api/v1/auth/register")
						.contentType(MediaType.APPLICATION_JSON)
						.content(registrationBody))
				.andExpect(status().isConflict());
		mockMvc.perform(post("/api/v1/auth/login")
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"username":"%s","password":"Pass123!"}
								""".formatted(username)))
				.andExpect(status().isOk());

		mockMvc.perform(post("/api/v1/auth/refresh")
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"refreshToken":"%s"}
								""".formatted(refreshToken)))
				.andExpect(status().isUnauthorized());
		mockMvc.perform(post("/api/v1/auth/logout")
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"refreshToken":"%s"}
								""".formatted(refreshToken)))
				.andExpect(status().isUnauthorized());

		String refreshed = mockMvc.perform(post("/api/v1/auth/refresh")
						.header("Authorization", "Bearer " + accessToken)
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"refreshToken":"%s"}
								""".formatted(refreshToken)))
				.andExpect(status().isOk())
				.andReturn().getResponse().getContentAsString();
		JsonNode refreshedTokens = jsonMapper.readTree(refreshed);
		String refreshedAccessToken = refreshedTokens.get("accessToken").asText();
		String refreshedRefreshToken = refreshedTokens.get("refreshToken").asText();
		assertNotEquals(accessToken, refreshedAccessToken);
		assertNotEquals(refreshToken, refreshedRefreshToken);
		mockMvc.perform(post("/api/v1/auth/refresh")
						.header("Authorization", "Bearer " + accessToken)
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"refreshToken":"%s"}
								""".formatted(refreshToken)))
				.andExpect(status().isUnauthorized());
		mockMvc.perform(post("/api/v1/auth/logout")
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"refreshToken":"%s"}
								""".formatted(refreshedRefreshToken)))
				.andExpect(status().isUnauthorized());
		mockMvc.perform(post("/api/v1/auth/logout")
						.header("Authorization", "Bearer " + refreshedAccessToken)
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"refreshToken":"%s"}
								""".formatted(refreshedRefreshToken)))
				.andExpect(status().isNoContent());
	}

	@Test
	void privateConversationMessagesFilesAndCallsRequireMembership() throws Exception {
		JsonNode firstAccount = registerAccount("first");
		JsonNode secondAccount = registerAccount("second");
		JsonNode outsiderAccount = registerAccount("outsider");
		String firstToken = firstAccount.get("accessToken").asText();
		String secondToken = secondAccount.get("accessToken").asText();
		String outsiderToken = outsiderAccount.get("accessToken").asText();

		String conversationResponse = mockMvc.perform(post("/api/v1/conversations/direct")
						.header("Authorization", "Bearer " + firstToken)
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"userId":"%s"}
								""".formatted(secondAccount.get("user").get("id").asText())))
				.andExpect(status().isCreated())
				.andReturn().getResponse().getContentAsString();
		JsonNode conversation = jsonMapper.readTree(conversationResponse);
		assertFalse(conversation.has("directKey"));
		String conversationId = conversation.get("id").asText();

		mockMvc.perform(post("/api/v1/conversations/{id}/messages", conversationId)
						.header("Authorization", "Bearer " + firstToken)
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"content":"Hello","clientMessageId":"client-1"}
								"""))
				.andExpect(status().isCreated());
		mockMvc.perform(post("/api/v1/conversations/{id}/messages", conversationId)
						.header("Authorization", "Bearer " + firstToken)
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"content":"Hello","clientMessageId":"client-1"}
								"""))
				.andExpect(status().isOk());
		mockMvc.perform(get("/api/v1/conversations/{id}/messages", conversationId)
						.header("Authorization", "Bearer " + secondToken))
				.andExpect(status().isOk());
		mockMvc.perform(get("/api/v1/conversations/{id}/messages", conversationId)
						.header("Authorization", "Bearer " + outsiderToken))
				.andExpect(status().isForbidden());

		mockMvc.perform(post("/api/v1/conversations/{id}/attachments", conversationId)
						.header("Authorization", "Bearer " + firstToken)
						.contentType(MediaType.APPLICATION_JSON)
						.content("{}"))
				.andExpect(status().isUnsupportedMediaType());

		MockMultipartFile upload = new MockMultipartFile(
				"file",
				"notes.txt",
				"text/plain",
				"private message attachment".getBytes(java.nio.charset.StandardCharsets.UTF_8)
		);
		String attachmentResponse = mockMvc.perform(multipart(
						"/api/v1/conversations/{id}/attachments",
						conversationId
				).file(upload).header("Authorization", "Bearer " + firstToken))
				.andExpect(status().isCreated())
				.andReturn().getResponse().getContentAsString();
		String attachmentId = jsonMapper.readTree(attachmentResponse).get("id").asText();
		mockMvc.perform(get("/api/v1/attachments/{id}", attachmentId)
						.header("Authorization", "Bearer " + secondToken))
				.andExpect(status().isOk());
		mockMvc.perform(get("/api/v1/attachments/{id}", attachmentId)
						.header("Authorization", "Bearer " + outsiderToken))
				.andExpect(status().isForbidden());

		String callResponse = mockMvc.perform(post("/api/v1/conversations/{id}/calls", conversationId)
						.header("Authorization", "Bearer " + firstToken))
				.andExpect(status().isCreated())
				.andReturn().getResponse().getContentAsString();
		String callId = jsonMapper.readTree(callResponse).get("id").asText();
		mockMvc.perform(patch("/api/v1/conversations/{conversationId}/calls/{callId}", conversationId, callId)
						.header("Authorization", "Bearer " + secondToken)
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"status":"ACCEPTED"}
								"""))
				.andExpect(status().isOk());
	}

	private JsonNode registerAccount(String prefix) throws Exception {
		String username = prefix + UUID.randomUUID().toString().replace("-", "").substring(0, 10);
		String response = mockMvc.perform(post("/api/v1/auth/register")
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"username":"%s","email":"%s@example.test","password":"long-test-password"}
								""".formatted(username, username)))
				.andExpect(status().isCreated())
				.andReturn().getResponse().getContentAsString();
		return jsonMapper.readTree(response);
	}

	private boolean containsParticipantRole(JsonNode participants, String userId, String role) {
		for (JsonNode participant : participants) {
			if (userId.equals(participant.get("id").asText())
					&& role.equals(participant.get("role").asText())) {
				return true;
			}
		}
		return false;
	}

	private Jwt createUserAndJwt() {
		User user = new User();
		user.setEmail(UUID.randomUUID() + "@example.test");
		user.setUsername(UUID.randomUUID().toString().substring(0, 10));
		user.setPasswordHash("test-password-hash");
		User savedUser = userRepository.saveAndFlush(user);
		return Jwt.withTokenValue("test-token")
				.header("alg", "HS256")
				.subject(savedUser.getId())
				.build();
	}

	private ConversationParticipant participant(String conversationId, String userId) {
		ConversationParticipant participant = new ConversationParticipant();
		participant.setId(new ConversationParticipantId(conversationId, userId));
		return participant;
	}
}
