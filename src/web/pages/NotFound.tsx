import { Compass } from '@phosphor-icons/react';
import { useNavigate } from 'react-router';
import { Button } from '../components/ui/Button';
import { Card, EmptyState } from '../components/ui/primitives';

export function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <Card>
      <EmptyState
        icon={Compass}
        title="This page does not exist"
        body="The link may be old. Head back to today and keep your streak going."
        action={
          <Button variant="primary" onClick={() => void navigate('/')}>
            Go to Today
          </Button>
        }
      />
    </Card>
  );
}
