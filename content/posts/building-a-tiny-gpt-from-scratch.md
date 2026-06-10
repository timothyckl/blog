+++
date = '2026-06-07T10:53:28+08:00'
draft = false
title = 'Building a Tiny GPT-2 From Scratch'
+++

In this series, I'll build a small GPT-2-style language model from scratch, train it on a subset of the [HuggingFaceFW/fineweb-edu](https://huggingface.co/datasets/HuggingFaceFW/fineweb-edu) dataset, and use it as a baseline for experiments in training, inference optimisation, architecture changes, and mechanistic interpretability.

The aim is to understand the full language modelling pipeline from end-to-end: data, tokenisation, model architecture, training, generation , evaluation, inspection.

## Who show read this 

This series is for developers with some programming and machine learning experience who want to understand decoder-only Transformers by building, training, modifying, and inspecting a small GPT-2- style language model.

You don't need prior experience training LLMs, but familiarity with vectors, matrices, matrix multiplication, dot products, and basic probability will help. 

## 1. Why build from scratch?

LLMs can feel enigmatic because most explanations start from finished systems and "just work". However, in this series, I want to go the other way and start with a small and understandable model, then build up from there one step at a time.

The first goal is to train a GPT-2 style LM from scratch. It won't be impressive by modern LLM standards, but it should be minimal enough to run experiments on, inspect and understand.

Once we have a working baseline, we can use it to ask more interesting questions like:

- how do architectural changes affect training?
- which inference optimisations matter?
- what can we lean by looking inside the model?

## 2. Why the GPT-2 architecture?

GPT-2 is a useful starting point because its simple enough to build, but still contains the core ideas behind modern decoder-only LMs.

It also gives us a clean baseline for learning the main pieces such as:

- token embeddings
- positional embeddings
- causal self-attention
- feed-forward layers
- residual connections
- layer normalisations
- autoregressive text generation

Newer models use many improvements over GPT-2, but starting with this architecture gives us something understandable to compare against. Once we have built our model, we can modify it and see what changes.

## 4. Next up

In the next post, I'll define the set up steps for this project which includes loading the FineWeb-Edu dataset, tokenising the samples, and converting the tokenised text into fixed-length sequences that our model can train on.
