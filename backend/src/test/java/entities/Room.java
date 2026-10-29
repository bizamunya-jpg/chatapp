package entities;

import java.util.ArrayList;
import java.util.List;

import com.subspring.chatapp.backend.entities.Message;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class Room {
    private String id;
    private String roomId;
    private List<Message> messages = new ArrayList<>();
}
