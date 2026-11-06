import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Toaster } from 'react-hot-toast';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '../../i18n/I18nProvider';
import JoinFlowModal from '../../components/queue/JoinFlowModal';
import { storage } from '../../services/storage';
import { TOKEN_STATUS } from '../../utils/constants';
import { freshDb, seedUser, seedQueue } from '../helpers';

describe('JoinQueueFlow (component)', () => {
  beforeEach(freshDb);

  it('blocks confirm until the checklist is acknowledged, then issues token #101', async () => {
    const user = await seedUser(1);
    const queue = await seedQueue(user, { countersCount: 1, maxSlots: 30 });

    render(
      <I18nProvider>
        <Toaster />
        <MemoryRouter>
          <JoinFlowModal open onClose={() => {}} queue={queue} user={user} onJoined={() => {}} />
        </MemoryRouter>
      </I18nProvider>
    );

    // checklist shows the admin-required doc
    expect(await screen.findByText('College ID')).toBeInTheDocument();

    // confirm button is disabled until the student ticks "I'm carrying all of these"
    const confirmBtn = screen.getByRole('button', { name: /confirm/i });
    expect(confirmBtn).toBeDisabled();

    // first checkbox on the form is the docs acknowledgement
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes.length).toBeGreaterThanOrEqual(2);
    await userEvent.click(checkboxes[0]);
    expect(confirmBtn).toBeEnabled();

    await userEvent.click(confirmBtn);

    // token lands in IndexedDB with number 101 and the docsAcknowledged flag
    await waitFor(async () => {
      const tokens = await storage.table('tokens').where('queueId').equals(queue.id).toArray();
      expect(tokens.length).toBe(1);
      expect(tokens[0].number).toBe(101);
      expect(tokens[0].status).toBe(TOKEN_STATUS.WAITING);
      expect(tokens[0].docsAcknowledged).toBe(true);
    });
  });
});
