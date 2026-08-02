import Checkbox from '@mui/material/Checkbox';

export default function ModalTable( { members }: { members: Array<Record<string, any>> } ){

    function closeModal(){
        const modal = document.getElementById("myModal");
        if(modal){
            modal.style.display = "none";
        }
    }

    return(
    <div id="myModal" className="modal">
      <div className="modal-content">
        <span className="close" onClick={closeModal}>&times;</span>
        <table>
          <thead>
            <tr>
              <th>Box ID</th>
              <th>Status</th>
              <th>Members</th>
              <th>Waitlist</th>
              <th>Updated By</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {members.map((box) => (
              <tr key={box.id}>
                <Checkbox  />
                <td>{box.id}</td>
                <td>
                  <span className="badge">{box.box_state ?? "—"}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
    );
}