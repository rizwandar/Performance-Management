import { useLocalSearchParams } from 'expo-router'
import { SECTIONS } from '../../src/lib/theme'
import RememberedScreen     from '../../src/screens/RememberedScreen'
import MessagesScreen       from '../../src/screens/MessagesScreen'
import SongsScreen          from '../../src/screens/SongsScreen'
import BucketListScreen     from '../../src/screens/BucketListScreen'
import FuneralWishesScreen  from '../../src/screens/FuneralWishesScreen'
import MedicalWishesScreen  from '../../src/screens/MedicalWishesScreen'
import KeyContactsScreen    from '../../src/screens/KeyContactsScreen'
import PeopleToNotifyScreen from '../../src/screens/PeopleToNotifyScreen'
import ChildrenScreen       from '../../src/screens/ChildrenScreen'
import LegalDocumentsScreen from '../../src/screens/LegalDocumentsScreen'
import PropertyScreen       from '../../src/screens/PropertyScreen'
import FinancialScreen      from '../../src/screens/FinancialScreen'
import DigitalLifeScreen    from '../../src/screens/DigitalLifeScreen'
import HouseholdScreen      from '../../src/screens/HouseholdScreen'

const SCREEN_MAP = {
  how_to_be_remembered:  RememberedScreen,
  personal_messages:     MessagesScreen,
  songs_that_define_me:  SongsScreen,
  life_wishes:           BucketListScreen,
  funeral_wishes:        FuneralWishesScreen,
  medical_wishes:        MedicalWishesScreen,
  key_contacts:          KeyContactsScreen,
  people_to_notify:      PeopleToNotifyScreen,
  'children-dependants': ChildrenScreen,
  legal_documents:       LegalDocumentsScreen,
  property_items:        PropertyScreen,
  financial_items:       FinancialScreen,
  digital_credentials:   DigitalLifeScreen,
  'household-info':      HouseholdScreen,
}

export default function SectionScreen() {
  const { id } = useLocalSearchParams()
  const Screen = SCREEN_MAP[id]
  return Screen ? <Screen /> : null
}
