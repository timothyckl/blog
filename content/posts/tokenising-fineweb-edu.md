+++
date = '2026-06-19T10:00:00+08:00'
draft = false
title = 'Tokenising FineWeb-Edu'
toc = true
+++

In the [previous post](/posts/building-a-tiny-gpt-from-scratch/), I laid out the goal for this series: build a small GPT-2-style language model from scratch, train it on a subset of FineWeb-Edu, and use it as a baseline for later experiments.

The first concrete step is turning raw text into something the model can learn from. Language models do not read text directly, they operate on sequences of token IDs. So before we can train anything, we need to:

1. load a subset of FineWeb-Edu
2. split the raw text into training and validation sets
3. tokenise each split with the GPT-2 tokeniser
4. group the token IDs into fixed-length training sequences
5. cache everything so training is repeatable

By the end of this post, we will have a data pipeline that produces batches of `(input_ids, labels)` pairs, the only format our model will ever see during training.

## Why FineWeb-Edu?

[FineWeb-Edu](https://huggingface.co/datasets/HuggingFaceFW/fineweb-edu) is a dataset of educational-quality web pages filtered from CommonCrawl. It contains ~1.3 trillion tokens of text that scored highly on an educational content classifier trained on Llama-3-70B-Instruct annotations.

The dataset is a good fit for a baseline language model because:

- **Real-world text.** The samples are actual web pages, not synthetic or simplified stories. The vocabulary and sentence structure are what a real language model encounters.
- **Manageable size.** We will not train on all 1.3 trillion tokens. For a small baseline, a subset of a few tens of millions of tokens is enough to see meaningful learning.
- **Open and accessible.** The dataset is published on HuggingFace under the ODC-By licence, so it is easy to load with the `datasets` library.
- **Diverse topics.** The educational filter produces text that covers a wide range of subjects, which makes the baseline more representative than a narrow-domain dataset.

We will use the `datasets` library to load the dataset directly from HuggingFace:

```python {filename="data.py"}
from datasets import load_dataset

ds = load_dataset("HuggingFaceFW/fineweb-edu", split="train", streaming=True)
```

The `streaming=True` flag lets us iterate through samples without downloading the entire dataset. Later we will take a fixed number of samples and cache them locally.

## Loading and inspecting a subset

The full FineWeb-Edu training split is enormous. For a small baseline, around 100,000–300,000 samples is more than enough. We will take the first `N` samples from the stream and collect them into a list:

```python {filename="data.py"}
from datasets import load_dataset

# Stream the training split and take a subset
stream = load_dataset("HuggingFaceFW/fineweb-edu", split="train", streaming=True)
texts = []
for i, sample in enumerate(stream):
    if i >= 200_000:
        break
    texts.append(sample["text"])
```

Each sample is a dictionary with a `"text"` key. The value is a string, the raw text of a web page. Let's print a few to see what we are working with:

```python {filename="data.py"}
for i in range(3):
    print(f"--- Sample {i} (length {len(texts[i])}) ---")
    print(texts[i][:500])
    print()
```

Typical output might look like this:

```text
--- Sample 0 (length 2847) ---
The concept of supply and demand is fundamental to understanding
how markets work. At its core, supply represents the quantity of...

--- Sample 1 (length 5102) ---
In mathematics, a function is a relation between a set of inputs
and a set of possible outputs where each input relates to exactly...

--- Sample 2 (length 923) ---
Photosynthesis is the process by which green plants and some other
organisms use sunlight to synthesise nutrients from carbon dioxide...
```

A few things to notice:

- Samples vary in length. Some are a few hundred characters, others several thousand.
- The text is clean, well-written English, no markup, no boilerplate, no obviously irrelevant content.
- Topics span science, mathematics, history, and other educational domains.

This also doubles as a quick sanity check: the text should be clean English with no stray markup or corruption.

The raw text is not yet in a format our model can use. Next, we turn it into tokens.

## Tokenisation

A language model does not read characters or words directly. It reads token IDs, integers that represent subword units. The mapping from text to token IDs is handled by a **tokeniser**.

GPT-2 uses [byte-pair encoding (BPE)](https://en.wikipedia.org/wiki/Byte_pair_encoding), trained on a large text corpus. BPE keeps common text compact while representing less common forms with several token IDs. The rows below show that change directly: `language` needs one ID, while `understandable` and `tokenisation` need several.

{{< theme-image light="/images/tokenising-fineweb-edu/bpe-tokenisation-quoted.gif?v=final-hold-1500" dark="/images/tokenising-fineweb-edu/bpe-tokenisation-quoted-dark.gif?v=final-hold-1500" alt="Three quoted raw-text examples passing through GPT-2 BPE and becoming one or more token IDs" caption="Quotation marks distinguish the raw strings from the token IDs produced by the tokeniser." >}}

Those IDs are the representation passed to the model; the original character boundaries no longer matter.

We load the GPT-2 tokeniser from HuggingFace:

```python {filename="data.py"}
from transformers import GPT2TokenizerFast

tokenizer = GPT2TokenizerFast.from_pretrained("gpt2")
tokenizer.pad_token = tokenizer.eos_token
```

The tokeniser has a vocabulary of 50,257 token IDs, ranging from 0 to 50256. Setting `pad_token = eos_token` configures EOS as the padding token, although this pipeline's complete fixed-length blocks do not require padding. If padding did happen, the model would learn to emit EOS mid-sequence, a confusing training signal. In practice no padding occurs, so the defensive assignment costs nothing.

To tokenise a single string:

```python {filename="data.py"}
result = tokenizer("The concept of supply and demand", add_special_tokens=False)
print(result["input_ids"])
# [464, 7988, 286, 20565, 290, 5019]
```

Each number corresponds to a subword token. We can round-trip to confirm:

```python {filename="data.py"}
print(tokenizer.decode([464, 7988, 286, 20565, 290, 5019]))
# 'The concept of supply and demand'
```

We can verify the round-trip is lossless:

```python {filename="data.py"}
text = "The concept of supply and demand"
ids = tokenizer(text, add_special_tokens=False)["input_ids"]
assert tokenizer.decode(ids) == text, "Round-trip mismatch"
```

Two important arguments:

- `add_special_tokens=False` makes the intended behaviour explicit: tokenisation should return only the text's BPE tokens. GPT-2 does not add a start-of-text token by default, but stating this option avoids relying on that default.
- `truncation=False`, a sample might be longer than the model's maximum context. We will handle that during grouping, not during tokenisation.

## End-of-sequence tokens

FineWeb-Edu contains independent documents, articles pulled from different web pages. They have no relationship to each other. If we concatenate them naïvely, the model might learn spurious connections across document boundaries. It might try to predict the start of a biology article from the end of a history article.

Compare the two paths below. Without a boundary, the model is trained to connect the end of document A directly to the start of document B. Inserting EOS turns the boundary itself into the next-token target.

{{< theme-image light="/images/tokenising-fineweb-edu/eos-boundary.gif?v=explicit-boundary" dark="/images/tokenising-fineweb-edu/eos-boundary-dark.gif?v=explicit-boundary" alt="Without EOS, the end of one quoted document predicts the unrelated start of the next; inserting EOS makes the document seam an explicit prediction target" caption="Without EOS, “after” points directly to “Biology”. With EOS, the hidden seam becomes an explicit boundary target." >}}

```python {filename="data.py"}
def tokenize_batch(batch):
    tokenized = tokenizer(
        batch["text"],
        add_special_tokens=False,
        truncation=False,
        return_attention_mask=False,
    )
    # Append EOS to each tokenised document
    tokenized["input_ids"] = [
        ids + [tokenizer.eos_token_id]
        for ids in tokenized["input_ids"]
    ]
    return tokenized
```

The end-of-sequence (EOS) token ID is 50256. When the model encounters it during training, it learns to treat it as a document boundary. This serves a dual purpose:

1. **Training.** The model learns that EOS is a valid next-token prediction, marking the boundary between otherwise unrelated documents.
2. **Inference.** A trained model can emit the EOS token, allowing inference code to treat it as a stopping signal.

We also suppress `return_attention_mask` because this dataset contains complete fixed-length blocks. The causal mask used inside the model is what prevents tokens from looking ahead, but that belongs in the modelling post rather than the data pipeline.

## Batched tokenisation

Tokenising one sample at a time would be slow. The `datasets` library lets us process many samples together with `map(batched=True)`:

```python {filename="data.py"}
from datasets import Dataset

# Convert our list of texts into a Dataset object
ds = Dataset.from_list([{"text": t} for t in texts])

# Tokenise all samples in one batched pass
tokenized = ds.map(
    tokenize_batch,
    batched=True,
    remove_columns=["text"],
)
```

What happens under the hood:

1. The dataset is split into mapping batches. Without an explicit `batch_size`, `datasets` uses its default.
2. Each batch is passed to `tokenize_batch()` as a dictionary of lists (e.g., `{"text": [sample_0, sample_1, ...]}`).
3. The tokeniser encodes all texts in the batch at once.
4. EOS tokens are appended to each resulting sequence.
5. The original `"text"` column is dropped, we only keep `"input_ids"`.

`batched=True` is faster because the Rust-based tokeniser can process many strings together, and we avoid the Python-loop overhead of calling `tokenizer()` once per sample.

After tokenisation, each sample in the dataset looks like this:

```python {filename="data.py"}
{
    "input_ids": [464, 7988, 286, ..., 20565, 290, 5019, 50256],
}
```

A list of token IDs, ending with EOS.

A quick check confirms every token ID is valid and the EOS tokens are in place:

```python {filename="data.py"}
sample = tokenized[0]["input_ids"]
assert all(0 <= tid <= 50256 for tid in sample), "Token ID out of range"
assert sample[-1] == tokenizer.eos_token_id, "Missing EOS"
```

## Fixed-length training sequences

We now have a dataset where each sample is a variable-length list of token IDs. But our Transformer model expects fixed-length inputs. It processes exactly `block_size` tokens at a time, no more, no less.

### Why fixed length?

Transformers can process varying sequence lengths up to their configured context limit. This implementation deliberately uses fixed-length sequences: each position has a learned positional embedding, and equal shapes make batching straightforward. We concatenate tokenised documents within each mapping batch and slice the resulting stream into equally-sized blocks.

### The shift by one

Autoregressive language models are trained for **next-token prediction**: they generate one token at a time, using the previous tokens as context. In the diagram, each input position points to the token directly below it: the labels are the same sequence shifted one place to the left.

{{< theme-image light="/images/tokenising-fineweb-edu/shift-by-one.gif?v=final-hold-1500" dark="/images/tokenising-fineweb-edu/shift-by-one-dark.gif?v=final-hold-1500" alt="Input tokens aligned with labels shifted one position to the left" caption="At position i, the model receives token xᵢ and learns to predict xᵢ₊₁." >}}

For a block of length `block_size`, we actually need `block_size + 1` tokens. `block_size` for the input, plus one extra as the final label. The input is tokens `[0:block_size]` and the label is tokens `[1:block_size+1]`.

### Concatenation and slicing

The transformation is easier to see before looking at its implementation. Start with two tokenised samples in the same mapping batch. Concatenate them without removing EOS, then take the first `block_size + 1` tokens as one complete block. Anything too short to fill another block in that mapping batch is discarded.

{{< theme-image light="/images/tokenising-fineweb-edu/concat-slicing.gif?v=mapping-batch-discard" dark="/images/tokenising-fineweb-edu/concat-slicing-dark.gif?v=mapping-batch-discard" alt="Two tokenised samples in one mapping batch concatenated into a stream and sliced into a complete block plus a visibly discarded remainder" caption="Within each mapping batch, four stream tokens form one example when block_size = 3; the three-token remainder is discarded." >}}

Here is the same operation in code:

```python {filename="data.py"}
import torch

# block_size is the number of tokens the model sees at once
# We need block_size + 1 to get block_size inputs and block_size labels

def group_texts(examples, block_size):
    # Concatenate the token lists in this mapping batch
    concatenated = sum(examples["input_ids"], [])

    # How many full blocks can we make?
    block_length = block_size + 1
    num_blocks = len(concatenated) // block_length

    # Discard the remainder so all blocks are equal size
    total_length = num_blocks * block_length

    inputs = []
    labels = []

    for i in range(0, total_length, block_length):
        block = concatenated[i : i + block_length]
        inputs.append(block[:-1])
        labels.append(block[1:])

    return {"input_ids": inputs, "labels": labels}
```

For the illustrated example, `block_size = 3`, so `block_length = 4`. The full block becomes:

```text
Block: [10, 20, 30, 50256]   ← 4 tokens (block_size + 1)
  Input: [10, 20, 30]         ← 3 tokens (block_size)
  Label: [20, 30, 50256]      ← 3 tokens (block_size)
```

So every block yields `block_size` inputs and `block_size` labels. The block is one token longer than either, and the labels are offset by a single token.

The model sees `[10, 20, 30]` and is asked to predict `20, 30, 50256` at positions 0, 1, and 2 respectively.

Since documents are concatenated, a single block can span across document boundaries. The EOS token that separates them ends up in the training data, which is intentional: the model must learn that sequences can end. When the concatenated stream does not divide evenly, a few tokens are discarded at the tail. With large enough mapping batches, this loss is negligible.

To confirm the grouping is correct, we inspect a block:

```python {filename="data.py"}
block = train_dataset[0]
print(f"input_ids shape: {block['input_ids'].shape}")  # (block_size,)
print(f"labels shape:    {block['labels'].shape}")     # (block_size,)

# Each label at position i should equal the input at position i+1
assert torch.equal(block["input_ids"][1:], block["labels"][:-1]), "Shift mismatch"
```

### block_size is a hyperparameter

The choice of `block_size` determines how much context the model can use. GPT-2 used a block size of 1024 tokens. For our small baseline, we will use something smaller, 128 or 256, to keep training fast and memory low while still giving the model enough context to form basic sentences.

We store `block_size` in our config:

```python {filename="config.py"}
@dataclass
class Config:
    block_size: int = 128
    # more to be added later!
```

## Train/validation split

Training needs two separate datasets:

- **Training set**, what the model learns from. The optimiser updates parameters to minimise loss on these examples.
- **Validation set**, a held-out portion the model never trains on. We measure validation loss to check whether the model is generalising or just memorising.

If we only looked at training loss, we might think the model is improving when it is actually overfitting. The validation set catches this.

We split the raw texts before tokenisation so the validation data is completely unseen. With 200,000 samples, the illustrated 90/10 split gives us 180,000 training samples and 20,000 validation samples. Each side then runs through tokenisation and grouping independently.

{{< theme-image light="/images/tokenising-fineweb-edu/train-val-split.png?v=fineweb-adaptation" dark="/images/tokenising-fineweb-edu/train-val-split-dark.png?v=fineweb-adaptation" alt="FineWeb-Edu adaptation in which two hundred thousand raw texts are split into 180,000 training and 20,000 validation samples before processing" caption="For FineWeb-Edu, the split happens first; both held-apart datasets then follow the same preprocessing path." >}}

```python {filename="data.py"}
# Split raw texts into train and validation
split_idx = int(len(texts) * 0.9)
train_texts = texts[:split_idx]
val_texts = texts[split_idx:]

# Convert each to a Dataset
train_ds = Dataset.from_list([{"text": t} for t in train_texts])
val_ds = Dataset.from_list([{"text": t} for t in val_texts])
```

Then we tokenise and group each set independently. The original pipeline consumes a dataset that already provides `train` and `validation` splits; creating the split here is the FineWeb-Edu-specific equivalent.

```python {filename="data.py"}
# Tokenise
train_tokenized = train_ds.map(tokenize_batch, batched=True, ...)
val_tokenized = val_ds.map(tokenize_batch, batched=True, ...)

# Group into fixed-length blocks within each mapping batch
train_grouped = train_tokenized.map(
    lambda examples: group_texts(examples, block_size=config.block_size),
    batched=True,
)
val_grouped = val_tokenized.map(
    lambda examples: group_texts(examples, block_size=config.block_size),
    batched=True,
)
```

The 90/10 split is arbitrary, the important thing is that validation data is held out and never used to update parameters. For a small baseline, the exact ratio matters less than consistency across experiments.

Finally, we set the PyTorch format so the DataLoader can consume the datasets:

```python {filename="data.py"}
train_grouped.set_format(type="torch", columns=["input_ids", "labels"])
val_grouped.set_format(type="torch", columns=["input_ids", "labels"])
```

Each item is now a dictionary of two tensors:

```python {filename="data.py"}
{
    "input_ids": tensor([464, 7988, 286, ..., 20565,  290]),  # shape: (block_size,)
    "labels":    tensor([7988,  286,  20565, ...,  290, 5019]),  # shape: (block_size,)
}
```

A quick spot-check can detect an obvious duplicate among a few blocks, although it cannot prove that no leakage occurred:

```python {filename="data.py"}
for i in range(5):
    for j in range(min(5, len(val_grouped))):
        assert not torch.equal(
            train_grouped[i]["input_ids"], val_grouped[j]["input_ids"]
        ), f"Train block {i} matches val block {j}"
```

## Caching processed datasets

Tokenising 200,000 samples and grouping them into blocks takes a minute or two, not huge, but enough to be annoying on every experiment restart. Worse, if we change a small detail in the grouping logic and need to rerun, we have to re-tokenise as well.

We solve this by caching the grouped datasets to disk:

```python {filename="data.py"}
import os
from datasets import load_from_disk

train_path = f"./data/fineweb_edu_tokenized_train_block_{config.block_size}"
val_path = f"./data/fineweb_edu_tokenized_val_block_{config.block_size}"

if os.path.exists(train_path) and os.path.exists(val_path):
    # Cache hit, load from disk
    train_dataset = load_from_disk(train_path)
    val_dataset = load_from_disk(val_path)
else:
    # Cache miss, process from scratch and save
    os.makedirs("./data", exist_ok=True)

    train_tokenized = train_ds.map(
        tokenize_batch,
        batched=True,
        remove_columns=["text"],
    )
    val_tokenized = val_ds.map(
        tokenize_batch,
        batched=True,
        remove_columns=["text"],
    )

    train_dataset = train_tokenized.map(
        lambda examples: group_texts(examples, block_size=config.block_size),
        batched=True,
    )
    val_dataset = val_tokenized.map(
        lambda examples: group_texts(examples, block_size=config.block_size),
        batched=True,
    )

    train_dataset.save_to_disk(train_path)
    val_dataset.save_to_disk(val_path)

train_dataset.set_format(type="torch", columns=["input_ids", "labels"])
val_dataset.set_format(type="torch", columns=["input_ids", "labels"])
```

The directory name encodes the dataset and the `block_size`. If we later want to experiment with a longer context length, say `block_size=256`, the code generates a new cache at `fineweb_edu_tokenized_train_block_256` without touching the existing one. Other preprocessing changes do not alter the path, so their old caches must be removed or versioned manually.

This pattern means:

- First run: download, tokenise, group, save. Slow.
- Every subsequent run: load from disk. Instant.
- New `block_size`: automatic recompute with a fresh cache directory.

To wrap up, let's confirm the DataLoader produces what the training loop expects:

```python {filename="data.py"}
from torch.utils.data import DataLoader

train_loader = DataLoader(train_dataset, batch_size=16, shuffle=True)
val_loader = DataLoader(val_dataset, batch_size=16, shuffle=False)
batch = next(iter(train_loader))

print(f"input_ids shape: {batch['input_ids'].shape}")  # (16, 128)
print(f"labels shape:    {batch['labels'].shape}")     # (16, 128)
print(f"dtype: {batch['input_ids'].dtype}")            # torch.int64
```

## What we have built

We started with raw text from FineWeb-Edu and ended with a data pipeline that produces fixed-length training examples.

The full pipeline now reads from raw text to model-ready batches. FineWeb-Edu is split immediately after loading; in the original implementation, the source dataset's existing training and validation splits enter the same processing stages independently.

{{< theme-image light="/images/tokenising-fineweb-edu/full-pipeline.png?v=fineweb-split" dark="/images/tokenising-fineweb-edu/full-pipeline-dark.png?v=fineweb-split" alt="FineWeb-Edu loading, its raw-text split, tokenisation, EOS insertion, per-mapping-batch concatenation, slicing, caching and batching in order" caption="FineWeb-Edu needs a split first; both sides are processed independently, cached, and batched as input_ids and labels." >}}

At this point, the processed datasets are cached. Training restarts and changes unrelated to preprocessing can reload them without re-tokenising; changing `block_size` creates a separate cache.

In the next post, we will take these token IDs and turn them into dense vectors. The model's first layer, the embedding, maps each integer to a learned vector, and the positional embedding tells the model where each token appears in the sequence.

```python {filename="model.py"}
# Where we are now:
input_ids = batch["input_ids"]   # (16, 128) of ints

# Where we are going next:
embeddings = embed(input_ids)     # (16, 128, 768) of floats
```
