import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Toaster } from 'react-hot-toast';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { I18nProvider } from '../../i18n/I18nProvider';
import QueueConsole from '../../pages/admin/QueueConsole';
import { callNext } from '../../services/queue/queueService';
import { storage } from '../../services/storage';
import { TOKEN_STATUS } from '../../utils/constants';
import { freshDb, seedUser, seedQueue, addWaitingToken } from '../helpers';

function renderConsole(queueId) {
  return render(
    <I18nProvider>
      <Toaster />
      <MemoryRouter initialEntries={[`/app/admin/queues/${queueId}`]}>
        <Routes>
          <Route path="/app/admin/queues/:queueId" element={<QueueConsole />} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>
  );
}

async function clickFirstCallNext() {
  // header CTA + one per-counter button share the label — click the first
  const buttons = await screen.findAllByRole('button', { name: /call next token/i });
  await userEvent.click(buttons[0]);
}

describe('Call Next flow (component + transactional service)', () => {
  beforeEach(freshDb);

  it('service: calls the lowest standard token first and binds the counter', async () => {
    const admin = await seedUser(0);
    const queue = await seedQueue(admin, { countersCount: 1 });
    const [u1, u2, u3] = await Promise.all([seedUser(1), seedUser(2), seedUser(3)]);
    await addWaitingToken(queue, u1, 101);
    await addWaitingToken(queue, u2, 102);
    await addWaitingToken(queue, u3, 103);

    const { token, counter } = await callNext(admin, queue.id, null);
    expect(token.number).toBe(101);
    expect(token.status).toBe(TOKEN_STATUS.CALLED);
    expect(counter.status).toBe('serving');
    expect(counter.currentTokenId).toBe(token.id);

    const stillWaiting = await storage
      .table('tokens')
      .where('[queueId+status]')
      .equals([queue.id, TOKEN_STATUS.WAITING])
      .toArray();
    expect(stillWaiting.map((t) => t.number).sort()).toEqual([102, 103]);
  });

  it('UI: clicking "Call next token" moves the head of the queue to a counter', async () => {
    const admin = await seedUser(0);
    const queue = await seedQueue(admin, { countersCount: 1 });
    const [u1, u2] = await Promise.all([seedUser(1), seedUser(2)]);
    await addWaitingToken(queue, u1, 101);
    await addWaitingToken(queue, u2, 102);

    renderConsole(queue.id);

    // console loaded with the waiting list showing both tokens
    expect(await screen.findByText(`${queue.code}-101`)).toBeInTheDocument();
    expect(screen.getByText(`${queue.code}-102`)).toBeInTheDocument();

    await clickFirstCallNext();

    await waitFor(async () => {
      const called = await storage
        .table('tokens')
        .where('[queueId+status]')
        .equals([queue.id, TOKEN_STATUS.CALLED])
        .toArray();
      expect(called.length).toBe(1);
      expect(called[0].number).toBe(101);
    });
    const waiting = await storage
      .table('tokens')
      .where('[queueId+status]')
      .equals([queue.id, TOKEN_STATUS.WAITING])
      .toArray();
    expect(waiting.map((t) => t.number)).toEqual([102]);
  });

  it('UI: reports a friendly toast when no one is waiting', async () => {
    const admin = await seedUser(0);
    const queue = await seedQueue(admin, { countersCount: 1 });
    renderConsole(queue.id);
    await clickFirstCallNext();
    await waitFor(() => {
      expect(screen.getAllByText(/no one is waiting/i).length).toBeGreaterThan(0);
    });
  });
});
