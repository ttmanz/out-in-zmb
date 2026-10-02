import { useCallback } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { ROUTES } from '../constants/routes';
import { useUser } from '../contexts/UserContext';

// Venue Plan mode: a venue whose free trial has ended and who hasn't subscribed
// can't use the venue tools. Send them to the subscription screen instead (replace,
// so Back doesn't land on the locked screen again). The database refuses the same
// actions regardless — this just explains why.
export const useVenueToolsGate = () => {
  const { venueAccess } = useUser();
  const navigation = useNavigation();

  useFocusEffect(
    useCallback(() => {
      if (venueAccess?.locked) navigation.replace(ROUTES.SUBSCRIPTION);
    }, [venueAccess?.locked, navigation])
  );
};
