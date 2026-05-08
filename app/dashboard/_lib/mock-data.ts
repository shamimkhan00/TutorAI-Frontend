import type { Msg } from "../_types/dashboard";

export const INITIAL_MESSAGES: Msg[] = [
  {
    id: "welcome",
    role: "assistant",
    content:
      "Hi! I'm TutorAI - your personal study assistant.\n\nUpload a PDF, textbook, or set of notes and I'll help you:\n\n- **Understand** any topic with clear explanations\n- **Summarise** documents into digestible key points\n- **Answer questions** strictly based on your material\n- **Quiz you** to check your understanding\n\nUpload something to get started!",
  },
];

export const MOCK_STREAM_RESPONSE = `Great question! Based on your document, here's a clear explanation:

**Backpropagation** is the algorithm that trains neural networks by computing how much each weight contributed to the error.

**How it works in 3 steps:**

1. **Forward pass** - Input flows through the network layer by layer, producing a prediction. A loss function then measures how wrong it was.

2. **Compute gradients** - Using the *chain rule* of calculus, the algorithm calculates how much each weight contributed to the error - working backwards from the output to the input.

3. **Update weights** - Each weight is nudged in the direction that reduces the loss, scaled by a learning rate.

**The key insight:** by reusing intermediate values computed during the forward pass, all gradients can be computed efficiently in a single backward sweep.

Think of it like this: if your answer on a test was wrong, backprop figures out *which specific things you learned* were responsible for the mistake, and corrects each one proportionally.`;
