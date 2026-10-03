import { Compass } from '@phosphor-icons/react';
import { useNavigate } from 'react-router';
import { Button } from '../components/ui/Button';
import { Card, EmptyState } from '../components/ui/primitives';
import { useI18n } from '../i18n';

export function NotFoundPage() {
  const navigate = useNavigate();
  const { t } = useI18n();
  return (
    <Card>
      <EmptyState
        icon={Compass}
        title={t('notFound.title')}
        body={t('notFound.body')}
        action={
          <Button variant="primary" onClick={() => void navigate('/')}>
            {t('notFound.cta')}
          </Button>
        }
      />
    </Card>
  );
}
