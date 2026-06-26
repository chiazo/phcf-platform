import Table from '../component/AdminMemberTableView'
import Navigation from './NavigationPage'
import SearchBar from '../component/SearchBar'

function AdminPage () {
    return(
        <>
        <Navigation/>
        <SearchBar/>
        <Table/>
        </>
    );

}

export default AdminPage